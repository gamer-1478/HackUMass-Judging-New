require("dotenv").config()
const express = require('express')
const app = express()
const session = require('cookie-session');
const passport = require('passport');
const mongoose = require('mongoose');
const cookieParser = require("cookie-parser");
const ejs = require('ejs');
const ejsLayouts = require('express-ejs-layouts');
const cors = require('cors');
const passportInit = require('./middleware/passport.js');
const path = require('node:path');
const csv = require("csvtojson");
const fs = require('fs');
const { Parser } = require('json2csv');
const nodemailer = require("nodemailer")
const QRCode = require("qrcode")
const sgMail = require("@sendgrid/mail")
const client = require("@sendgrid/client")
client.setApiKey(process.env.SENDGRID_API_KEY)
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const PORT = process.env.PORT || 3000

//file imports
const authRouter = require('./routes/authRouter');
const { ensureAuthenticated } = require("./middleware/auth.js");
const userSchema = require("./schemas/userSchema.js");
const projectSchema = require("./schemas/projectSchema.js");
const teamSchema = require("./schemas/teamSchema.js");
const { table } = require("node:console");
const crypto = require("crypto");

//prod stuff (DO NOT TOUCH)
if (process.env.NODE_ENV === 'production') {
    app.enable('trust proxy');
}
else {
    app.disable('trust proxy');
}

//cors middleware
const corsOptions = {
    origin: (origin, callback) => {
        callback(null, true);
    },
    credentials: true
}
app.use(cors(corsOptions))

//middlewares
app.use(express.json({ limit: '50mb' }), express.urlencoded({ extended: true, limit: '50mb' }))
app.use(express.static('public'))
app.use(express.static('songs'))
app.use(ejsLayouts)

//set views as ejs
app.set('view engine', 'ejs')
app.set('views', 'views')


//cookie stuff (DO NOT TOUCH)
if (process.env.NODE_ENV === 'production') {
    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: true,
        saveUninitialized: true,
        sameSite: 'none',
        overwrite: true,
        secure: true,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }));
} else {
    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: true,
        saveUninitialized: true,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }));
}

app.use(cookieParser(process.env.SESSION_SECRET));

passportInit(passport)

//initialize passport after thiss
app.use(passport.initialize());
app.use(passport.session());

//connect to mongodb
const dbUri = process.env.MONGO_URI
mongoose.connect(dbUri, { useNewUrlParser: true, useUnifiedTopology: true }).then(console.log("Connected to mongodb"))

//parse csv files
var CsvfileJudges = ("./datafiles/judges_auth.csv");
var CsvfileAssignments = ("./datafiles/assignments.csv");
var CsvfileTeams = ("./datafiles/team.csv");
CsvfileJudges = path.resolve(CsvfileJudges)
CsvfileAssignments = path.resolve(CsvfileAssignments)
CsvfileTeams = path.resolve(CsvfileTeams)

csv().fromFile(CsvfileAssignments).then((jsonObj) => { CsvfileAssignments = jsonObj })
csv().fromFile(CsvfileTeams).then((jsonObj) => { CsvfileTeams = jsonObj })
csv().fromFile(CsvfileJudges).then((jsonObj) => { CsvfileJudges = jsonObj })

//routing

app.get("/", (req, res) => {
    res.render("landing.ejs", { currentPage: "home" })
})

app.get("/leaderboard", async (req, res) => {
    try {
        // Get all completed judgements from database
        const completedJudgements = await projectSchema.find()

        // Create a map to count judgements per table
        const judgementsPerTable = {}
        completedJudgements.forEach((judgement) => {
            const tableNum = judgement.teamTable
            if (!judgementsPerTable[tableNum]) {
                judgementsPerTable[tableNum] = 0
            }
            judgementsPerTable[tableNum]++
        })

        // Count total assignments per table
        const assignmentsPerTable = {}
        CsvfileAssignments.forEach((assignment) => {
            // Skip header properties
            if (assignment.Judge) {
                // Loop through all slots for this judge
                Object.keys(assignment).forEach((key) => {
                    if (key.startsWith("Slot ")) {
                        const slot = assignment[key]
                        if (slot) {
                            // Extract table number from slot (e.g., "mqv (Table 1)" -> "1")
                            let tableNum = slot.substring(slot.indexOf(" ") + 1) // "(Table 1)"
                            tableNum = tableNum.substring(tableNum.indexOf(" ") + 1) // "1)"
                            tableNum = tableNum.replace(")", "") // "1"

                            if (!assignmentsPerTable[tableNum]) {
                                assignmentsPerTable[tableNum] = 0
                            }
                            assignmentsPerTable[tableNum]++
                        }
                    }
                })
            }
        })

        // Build leaderboard data
        const leaderboardData = CsvfileTeams.map((team) => {
            const tableNum = team.tableNumber
            const completed = judgementsPerTable[tableNum] || 0
            const total = assignmentsPerTable[tableNum] || 0

            return {
                teamName: team.teamName,
                tableNumber: team.tableNumber,
                roomNumber: team.roomNumber,
                category: team.categoryApplied,
                completed: completed,
                total: total,
                percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
            }
        })

        // Sort by completion percentage (highest first), then by completed count
        leaderboardData.sort((a, b) => {
            if (b.percentage !== a.percentage) {
                return b.percentage - a.percentage
            }
            return b.completed - a.completed
        })

        // Calculate overall stats
        const totalTeams = leaderboardData.length
        const totalCompleted = leaderboardData.reduce((sum, team) => sum + team.completed, 0)
        const totalAssignments = leaderboardData.reduce((sum, team) => sum + team.total, 0)
        const fullyEvaluated = leaderboardData.filter((team) => team.completed === team.total && team.total > 0).length

        res.render("leaderboard.ejs", {
            teams: leaderboardData,
            stats: {
                totalTeams,
                totalCompleted,
                totalAssignments,
                fullyEvaluated,
            },
            currentPage: "leaderboard",
        })
    } catch (error) {
        console.error("Error generating leaderboard:", error)
        res.redirect("/404")
    }
})

app.use("/auth", authRouter);

app.get("/dashboard", ensureAuthenticated, async (req, res) => {
    userSchema.findOne({ email: req.user.Judge_Email }).then(async (user) => {
        if (!user) {
            userSchema.create({
                email: req.user.Judge_Email,
                name: req.user.Judge,
                currentProject: 1
            }).then(() => {
                res.redirect("/dashboard")
            })
        }
        else {
            var ListOfAssignments = CsvfileAssignments.find(assignment => assignment.Judge === req.user.Judge);
            var slot = "Slot " + user.currentProject;

            var currentSlot = ListOfAssignments[slot];
            if (!currentSlot) {
                res.redirect("/thankyou")
            } else {
                //orignal = mqv (Table 1)
                currentSlot = currentSlot.substring(currentSlot.indexOf(' ') + 1) //(Table 1)
                currentSlot = currentSlot.substring(currentSlot.indexOf(' ') + 1); // 1)
                currentSlot = currentSlot.replace(")", ""); //1

                var currentTeam = CsvfileTeams.find(team => team.tableNumber == currentSlot);
                const totalProjects = Object.keys(ListOfAssignments).length - 2;

                res.render("judge.ejs", {
                    "currentProject": currentTeam.teamName,
                    "currentTable": currentTeam.tableNumber,
                    "currentProjectCategory": currentTeam.categoryApplied,
                    "currentSlot": currentSlot,
                    "totalProjects": totalProjects,
                    "roomNumber": currentTeam.roomNumber,
                    "currentPage": "dashboard",
                    "navbar": true
                })
            }
        }
    })
})

app.post("/dashboard", ensureAuthenticated, async (req, res) => {
    var { score1, score2, score3, score4, score5, score6, comments, tableNumber } = req.body;

    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });

    var CurrentTeam = await CsvfileTeams.find(team => team.tableNumber == tableNumber);

    projectSchema.create({
        teamName: CurrentTeam.teamName,
        teamCategory: CurrentTeam.categoryApplied,
        teamJudge: req.user.Judge,
        teamJudgeEmail: req.user.Judge_Email,
        teamTable: tableNumber,
        score1,
        score2,
        score3,
        score4,
        score5,
        score6,
        comments
    }).then(() => {
        CurrentJudge.currentProject = CurrentJudge.currentProject + 1;
        CurrentJudge.judgedProjects = [...CurrentJudge.judgedProjects, tableNumber];
        CurrentJudge.skippedProjects = CurrentJudge.skippedProjects.filter(slot => {
            slotNumber = slot.substring(slot.indexOf(' ') + 1) //(Table 1)
            slotNumber = slotNumber.substring(slotNumber.indexOf(' ') + 1); // 1)
            slotNumber = slotNumber.replace(")", ""); //1
            return slotNumber !== tableNumber;
        });
        CurrentJudge.save().then(() => {
            res.redirect("/dashboard");
        });
    })
})

app.post("/skip", ensureAuthenticated, async (req, res) => {
    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });
    var ListOfAssignments = CsvfileAssignments.find(assignment => assignment.Judge === req.user.Judge);
    var slot = "Slot " + CurrentJudge.currentProject;
    var currentSlot = ListOfAssignments[slot];
    CurrentJudge.currentProject = CurrentJudge.currentProject + 1;
    CurrentJudge.skippedProjects = [...CurrentJudge.skippedProjects, currentSlot];
    CurrentJudge.save().then(() => {
        res.redirect("/dashboard");
    })
})

app.get("/skipped", ensureAuthenticated, async (req, res) => {
    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });
    var ListOfAssignments = CsvfileAssignments.find(assignment => assignment.Judge === req.user.Judge);
    console.log("Current Judge:", CurrentJudge);
    var skippedProjectsDetails = CurrentJudge.skippedProjects.map(slot => {
        let currentSlot = slot;
        currentSlot = currentSlot.substring(currentSlot.indexOf(' ') + 1) //(Table 1)
        currentSlot = currentSlot.substring(currentSlot.indexOf(' ') + 1); // 1)
        currentSlot = currentSlot.replace(")", ""); //1

        var CurrentTeam = CsvfileTeams.find(team => team.tableNumber == currentSlot);
        console.log("Current Team for skipped project:", CurrentTeam);
        return {
            name: CurrentTeam.teamName,
            tableNumber: CurrentTeam.tableNumber,
            roomNumber: CurrentTeam.roomNumber,
            category: CurrentTeam.categoryApplied
        };
    });

    res.render("skip.ejs", {
        skippedProjects: skippedProjectsDetails,
        currentPage: "skipped",
        navbar: true
    });
})

app.get("/assignment-sheet", ensureAuthenticated, async (req, res) => {
    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });
    var ListOfAssignments = CsvfileAssignments.find(assignment => assignment.Judge === req.user.Judge);
    var assignmentsDetails = [];

    //instead of looping to the current project, loop through all assignments
    for (let i = 1; i <= Object.keys(ListOfAssignments).length - 2; i++) {
        let slot = "Slot " + i;
        let currentSlot = ListOfAssignments[slot];
        if (currentSlot) {
            currentSlot = currentSlot.substring(currentSlot.indexOf(' ') + 1) //(Table 1)
            currentSlot = currentSlot.substring(currentSlot.indexOf(' ') + 1); // 1)
            currentSlot = currentSlot.replace(")", ""); //1

            var CurrentTeam = CsvfileTeams.find(team => team.tableNumber == currentSlot);

            assignmentsDetails.push({
                name: CurrentTeam.teamName,
                tableNumber: CurrentTeam.tableNumber,
                roomNumber: CurrentTeam.roomNumber,
                category: CurrentTeam.categoryApplied,
                judged: i <= CurrentJudge.judgedProjects.length
            });
        }
    }

    res.render("assignments.ejs", {
        assignments: assignmentsDetails,
        judgedCount: CurrentJudge.judgedProjects.length,
        totalAssigned: assignmentsDetails.length,
        currentPage: "assignment-sheet",
        navbar: true
    });
})

app.get("/rejudge/:tableNumber", ensureAuthenticated, async (req, res) => {
    //render judge.ejs with the project matching the table number
    var tableNumber = req.params.tableNumber;
    var currentTeam = CsvfileTeams.find(team => team.tableNumber == tableNumber);
    res.render("judge.ejs", {
        "currentProject": currentTeam.teamName,
        "currentTable": currentTeam.tableNumber,
        "currentProjectCategory": currentTeam.categoryApplied,
        "currentSlot": tableNumber,
        "totalProjects": null,
        "roomNumber": currentTeam.roomNumber,
        "currentPage": "dashboard",
        "navbar": true
    })
})

// app.get("/weneedthefuckingdata", async (req, res) => {
//     projectSchema.find().then((projects) => {
//         //convert this data to a csv
//         const fields = [
//             'teamName',
//             'teamCategory',
//             'teamJudge',
//             'teamJudgeEmail',
//             'teamTable',
//             'score1',
//             'score2',
//             'score3',
//             'score4',
//             'score5',
//             'score6',
//             'comments',
//             'date'
//         ];
//         // Initialize json2csv parser
//         const json2csvParser = new Parser({ fields });
//         const csv = json2csvParser.parse(projects);

//         // Write CSV data to a file
//         fs.writeFile('JudgeSoftware.csv', csv, (err) => {
//             if (err) {
//                 console.error('Error writing to CSV file', err);
//             } else {
//                 console.log('CSV file successfully created');
//             }
//         });
//     }).catch(err => {
//         console.error('Error fetching data from MongoDB', err);
//     });
//     res.send("Hello")
// })


app.get("/404", (req, res) => {
    res.render("404.ejs", { currentPage: "404" })
})

app.get("/thankyou", (req, res) => {
    res.render("thankyou.ejs", { currentPage: "thankyou" })
})

app.get("/checkin1", ensureAuthenticated, (req, res) => {
    res.render("checkin1-admin.ejs", { currentPage: "checkin1" })
})

const ROOM_CONFIG = [
    { roomNumber: 1, capacity: 49 }, // S131
    { roomNumber: 2, capacity: 33 }, // S110
    { roomNumber: 3, capacity: 33 }, // S120
    { roomNumber: 4, capacity: 22 }, // N101
    { roomNumber: 5, capacity: 40 }, // S140
    { roomNumber: 6, capacity: 31 }, // Hardware room - last room
]

// Helper function to check if project is hardware
function isHardwareProject(category) {
    if (!category) return false
    const categoryLower = category.toLowerCase()
    return categoryLower.includes("hardware") || categoryLower.includes("iot") || categoryLower.includes("robotics")
}

// Helper function to get next available table assignment
async function getNextAvailableTable(isHardware, session) {
    if (isHardware) {
        const hardwareRoom = ROOM_CONFIG[ROOM_CONFIG.length - 1]
        // Use session to ensure count is done within transaction
        const teamsInHardwareRoom = await teamSchema
            .countDocuments({
                checkin1: true,
                RoomNumber: hardwareRoom.roomNumber,
            })
            .session(session)

        if (teamsInHardwareRoom >= hardwareRoom.capacity) {
            throw new Error("Hardware room is full. Please contact organizers.")
        }

        return {
            tableNumber: teamsInHardwareRoom + 1,
            roomNumber: hardwareRoom.roomNumber,
        }
    }

    const regularRooms = ROOM_CONFIG.slice(0, -1) // All rooms except last one

    for (const room of regularRooms) {
        // Use session to ensure count is done within transaction
        const teamsInRoom = await teamSchema
            .countDocuments({
                checkin1: true,
                RoomNumber: room.roomNumber,
            })
            .session(session)

        if (teamsInRoom < room.capacity) {
            return {
                tableNumber: teamsInRoom + 1,
                roomNumber: room.roomNumber,
            }
        }
    }

    throw new Error("All regular rooms are full. Please contact organizers.")
}

app.post("/api/checkin1", ensureAuthenticated, async (req, res) => {
    const maxRetries = 3
    let retryCount = 0

    while (retryCount < maxRetries) {
        const session = await mongoose.startSession()
        session.startTransaction()

        try {
            const { qrData } = req.body

            // Decode the base64 email from QR code
            const projectEmail = Buffer.from(qrData, "base64").toString("utf-8")

            const team = await teamSchema.findOne({ ProjectEmail: projectEmail }).session(session)

            if (!team) {
                await session.abortTransaction()
                session.endSession()
                return res.json({ success: false, message: "Team not found" })
            }

            if (team.checkin1) {
                await session.abortTransaction()
                session.endSession()
                return res.json({
                    success: false,
                    message: "Team already checked in",
                })
            }

            const isHardware = isHardwareProject(team.Category)
            const assignment = await getNextAvailableTable(isHardware, session)

            const duplicateCheck = await teamSchema
                .findOne({
                    RoomNumber: assignment.roomNumber,
                    TableNumber: assignment.tableNumber,
                    checkin1: true,
                })
                .session(session)

            if (duplicateCheck) {
                // Another team got this table, retry
                await session.abortTransaction()
                session.endSession()
                retryCount++
                console.log(`[v0] Duplicate table detected for ${team.ProjectName}, retrying... (${retryCount}/${maxRetries})`)
                continue
            }

            team.TableNumber = assignment.tableNumber
            team.RoomNumber = assignment.roomNumber
            team.checkin1 = true
            await team.save({ session })

            // Commit the transaction
            await session.commitTransaction()
            session.endSession()


            const base64Email = Buffer.from(team.ProjectEmail).toString("base64")
            const checkin2Link = `${process.env.BASE_URL || "http://localhost:3000"}/checkin2/${base64Email}`

            const emailHtml = await ejs.renderFile(path.join(__dirname, "views", "emails", "table-assignment.ejs"), {
                teamName: team.ProjectName,
                tableNumber: assignment.tableNumber,
                roomNumber: assignment.roomNumber,
                checkin2Link: checkin2Link,
            })

            await sgMail.send({
                from: process.env.EMAIL_USER,
                to: team.ProjectEmail,
                subject: "✅ Check-In Complete - Your Table Assignment",
                html: emailHtml,
            })

            console.log(`[v0] Team ${team.ProjectName} checked in - Table ${assignment.tableNumber}, Room ${assignment.roomNumber}`)

            res.json({
                success: true,
                tableNumber: assignment.tableNumber,
                roomNumber: assignment.roomNumber,
                teamName: team.ProjectName,
            })
        } catch (error) {
            console.error("[v0] Error in checkin1:", error)
            res.json({ success: false, message: "Check-in failed. Please try again." })
        }
    }
    return res.json({ success: false, message: "Check-in failed after multiple attempts. Please try again." })
})

app.get("/checkin2/:base64email", async (req, res) => {
    try {
        const { base64email } = req.params
        const projectEmail = Buffer.from(base64email, "base64").toString("utf-8")

        const team = await teamSchema.findOne({ ProjectEmail: projectEmail })

        if (!team) {
            console.error(`[v0] Team with email ${projectEmail} not found for checkin2`)
            return res.redirect("/404")
        }

        if (!team.checkin1) {
            return res.render("error.ejs", {
                message: "Please complete Check-In Step 1 at the Organizer Desk first.",
                currentPage: "error",
            })
        }

        if (team.checkin2) {
            return res.render("success.ejs", {
                message: "You have already completed check-in. Good luck with your project!",
                currentPage: "success",
            })
        }

        res.render("checkin2-participant.ejs", {
            teamEmail: projectEmail,
            teamName: team.ProjectName,
            tableNumber: team.TableNumber,
            roomNumber: team.RoomNumber,
            currentPage: "checkin2",
        })
    } catch (error) {
        console.error("[v0] Error in checkin2 page:", error)
        //res.redirect("/404")
    }
})

app.post("/api/checkin2", async (req, res) => {
    try {
        const { teamEmail, tableQRData } = req.body

        const team = await teamSchema.findOne({ ProjectEmail: teamEmail })

        if (!team) {
            return res.json({ success: false, message: "Team not found" })
        }

        if (!team.checkin1) {
            return res.json({
                success: false,
                message: "Please complete Step 1 check-in first",
            })
        }

        if (team.checkin2) {
            return res.json({
                success: false,
                message: "You have already completed this check-in",
            })
        }

        // Verify the QR code matches the assigned table
        // The table QR should contain table number info
        const expectedTableData = crypto.createHash('sha256').update(`Table ${team.TableNumber}`).digest('hex')

        if (tableQRData !== expectedTableData) {
            return res.json({
                success: false,
                message: `Wrong table! This is not Table ${team.TableNumber}`,
            })
        }

        // Mark check-in 2 as complete
        team.checkin2 = true
        await team.save()

        console.log(`[v0] Team ${team.ProjectName} completed check-in 2`)

        res.json({
            success: true,
            message: "Check-in complete! You're all set. Good luck with your project!",
        })
    } catch (error) {
        console.error("[v0] Error in checkin2 API:", error)
        res.json({ success: false, message: "Check-in failed. Please try again." })
    }
})

app.get("/uploadTeams", ensureAuthenticated, async (req, res) => {
    try {
        if (!CsvfileTeams || CsvfileTeams.length === 0) {
            return res.status(500).json({
                success: false,
                message: "Team data not loaded. Please ensure team.csv is available.",
            })
        }

        let successCount = 0
        let skipCount = 0
        let errorCount = 0

        for (const team of CsvfileTeams) {
            try {
                const existingTeam = await teamSchema.findOne({ ProjectName: team.teamName, ProjectEmail: team.projectEmail })

                if (existingTeam) {
                    console.log(`[v0] Team ${team.teamName} already exists, skipping...`)
                    skipCount++
                    continue
                }

                const newTeam = await teamSchema.create({
                    ProjectEmail: team.projectEmail,
                    ProjectName: team.teamName,
                    Category: team.categoryApplied,
                    LeadName: team.LeadFirst + " " + team.LeadLast,
                    Mem1Name: team.TeamMem1First || "" + " " + team.TeamMem1Last || "",
                    Mem2Name: team.TeamMem2First || "" + " " + team.TeamMem2Last || "",
                    Mem3Name: team.TeamMem3First || "" + " " + team.TeamMem3Last || "",
                    Mem4Name: team.TeamMem4First || "" + " " + team.TeamMem4Last || "",
                    Mem1Email: team.TeamMem1Email || "",
                    Mem2Email: team.TeamMem2Email || "",
                    Mem3Email: team.TeamMem3Email || "",
                    Mem4Email: team.TeamMem4Email || "",
                    ProjectLink: team.SubUrl,
                    HardwareJudge: team.HardwareJudge == "true" ? true : false || false,
                    checkin1: false,
                    checkin2: false,
                })

                const base64Email = Buffer.from(team.projectEmail).toString("base64")
                const checkin2Link = `${process.env.BASE_URL || "http://localhost:3000"}/checkin2/${base64Email}`

                const qrCodeBuffer = await QRCode.toBuffer(base64Email, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: "#7c3aed",
                        light: "#ffffff",
                    },
                })

                const emailHtml = await ejs.renderFile(path.join(__dirname, "views", "emails", "initial-team-invite.ejs"), {
                    teamName: team.teamName,
                    checkin2Link: checkin2Link,
                })

                if (process.env.SEND_EMAILS == "FALSE") {
                    console.log(`[v0] Email sending disabled. Skipping email for ${team.teamName}`)
                    errorCount++
                    continue
                } else {
                    await sgMail.send({
                        from: process.env.EMAIL_USER,
                        to: team.projectEmail,
                        subject: "🎯 HackUMass XIII Judging Check-In Instructions - Action Required",
                        html: emailHtml,
                        attachments: [
                            {
                                content: qrCodeBuffer.toString("base64"),
                                filename: "checkin-qrcode.png",
                                cid: "checkinQR", // Content ID for referencing in HTML
                                type: "image/png",
                                disposition: "inline",
                                content_id: "checkinQR"
                            },
                        ],
                    })
                    console.log(`[v0] Successfully sent email to ${team.teamName} (${team.projectEmail})`)
                    successCount++
                }

            } catch (teamError) {
                console.error(`[v0] Error processing team ${team.teamName}:`, teamError)
                errorCount++
            }
        }

        res.json({
            success: true,
            message: `Teams processed: ${successCount} sent, ${skipCount} skipped, ${errorCount} errors`,
            details: {
                sent: successCount,
                skipped: skipCount,
                errors: errorCount,
                total: CsvfileTeams.length,
            },
        })
    } catch (error) {
        console.error("[v0] Error in uploadTeams route:", error)
        res.status(500).json({
            success: false,
            message: "Error processing teams",
            error: error.message,
        })
    }
})

app.get("/download-teams-checkin2", ensureAuthenticated, async (req, res) => {
    try {
        const teams = await teamSchema.find({ checkin2: true })
        const mappedTeams = teams.map(team => ({
            teamName: team.ProjectName,
            tableNumber: team.TableNumber,
            categoryApplied: team.Category,
            RoomNumber: team.RoomNumber
        }))
        const fields = ['teamName', 'tableNumber', 'categoryApplied', 'RoomNumber']
        const json2csvParser = new Parser({ fields })
        const csv = json2csvParser.parse(mappedTeams)

        //save to datafiles folder
        fs.writeFileSync(path.join(__dirname, 'datafiles', 'teams-checkin2.csv'), csv)
        res.header('Content-Type', 'text/csv')
        res.attachment('teams-checkin2.csv')
        return res.send(csv)
    } catch (error) {
        console.error("[v0] Error in download-teams-checkin2 route:", error)
        res.status(500).send("Error generating CSV")
    }
})

app.get("/check-failed-emails", ensureAuthenticated, async (req, res) => {
    try {
        // Fetch bounced emails from SendGrid
        const [bouncesResponse] = await client.request({
            url: "/v3/suppression/bounces",
            method: "GET",
        })

        const bouncedEmails = bouncesResponse.body.map((bounce) => bounce.email)

        if (bouncedEmails.length === 0) {
            console.log("[v0] No bounced emails found")
            return res.json({
                success: true,
                message: "No bounced emails found",
                bouncedTeams: [],
            })
        }

        // Find teams with bounced emails
        const affectedTeams = await teamSchema.find({
            ProjectEmail: { $in: bouncedEmails },
        })

        console.log("\n========== BOUNCED EMAIL REPORT ==========")
        console.log(`Total bounced emails: ${bouncedEmails.length}`)
        console.log(`Affected teams: ${affectedTeams.length}\n`)

        affectedTeams.forEach((team, index) => {
            console.log(`${index + 1}. Team: ${team.ProjectName}`)
            console.log(`   Email: ${team.ProjectEmail}`)
            console.log(`   Category: ${team.Category || "N/A"}`)
            console.log(`   Check-in 1: ${team.checkin1 ? "✓" : "✗"}`)
            console.log(`   Check-in 2: ${team.checkin2 ? "✓" : "✗"}`)
            if (team.TableNumber && team.RoomNumber) {
                console.log(`   Assigned: Table ${team.TableNumber}, Room ${team.RoomNumber}`)
            }
            console.log("---")
        })

        console.log("==========================================\n")

        res.json({
            success: true,
            bouncedCount: bouncedEmails.length,
            affectedTeamsCount: affectedTeams.length,
            bouncedTeams: affectedTeams.map((team) => ({
                teamName: team.ProjectName,
                email: team.ProjectEmail,
                category: team.Category,
                checkin1: team.checkin1,
                checkin2: team.checkin2,
                tableNumber: team.TableNumber,
                roomNumber: team.RoomNumber,
            })),
        })
    } catch (error) {
        console.error("[v0] Error checking bounced emails:", error)
        res.status(500).json({
            success: false,
            message: "Error checking bounced emails",
            error: error.message,
        })
    }
})


// // catch-all route: use '/*' so path-to-regexp treats it as a valid wildcard
// app.use((req, res) => {
//     res.redirect("/404")
// })
//listen
app.listen(PORT, () => console.log(`Connected on port ${PORT}`))