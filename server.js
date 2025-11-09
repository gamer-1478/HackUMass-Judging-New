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
const PORT = process.env.PORT || 3000

//file imports
const authRouter = require('./routes/authRouter');
const dashboardRouter = require('./routes/dashboardRouter.js');
const checkinRouter = require('./routes/checkinRouter.js');

const { ensureAuthenticated } = require("./middleware/auth.js");
const userSchema = require("./schemas/userSchema.js");
const teamSchema = require("./schemas/teamSchema.js");
const { generateJudgingAssignments } = require("./utils/judging-api.js");

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

const ROOM_CONFIG = [
    { roomNumber: 1, capacity: 33 }, // S110
    { roomNumber: 2, capacity: 49 }, // S131
    { roomNumber: 3, capacity: 33 }, // S120
    { roomNumber: 4, capacity: 40 }, // S140
    { roomNumber: 5, capacity: 22 }, // N101
    { roomNumber: 6, capacity: 31 }, // Hardware room - last room N155
]

//connect to mongodb
const dbUri = process.env.MONGO_URI
mongoose.connect(dbUri, { useNewUrlParser: true, useUnifiedTopology: true }).then(console.log("Connected to mongodb"))

//parse csv files
var CsvfileJudges = ("./datafiles/judges_auth.csv");
CsvfileJudges = path.resolve(CsvfileJudges)
csv().fromFile(CsvfileJudges).then((jsonObj) => { CsvfileJudges = jsonObj })

//routing

app.get("/", (req, res) => {
    res.render("landing.ejs", { currentPage: "home" })
})

// app.get("/leaderboard", async (req, res) => {
//     try {
//         // Get all completed judgements from database
//         const completedJudgements = await projectSchema.find()

//         // Create a map to count judgements per table
//         const judgementsPerTable = {}
//         completedJudgements.forEach((judgement) => {
//             const tableNum = judgement.teamTable
//             if (!judgementsPerTable[tableNum]) {
//                 judgementsPerTable[tableNum] = 0
//             }
//             judgementsPerTable[tableNum]++
//         })

//         // Count total assignments per table
//         const assignmentsPerTable = {}
//         CsvfileAssignments.forEach((assignment) => {
//             // Skip header properties
//             if (assignment.Judge) {
//                 // Loop through all slots for this judge
//                 Object.keys(assignment).forEach((key) => {
//                     if (key.startsWith("Slot ")) {
//                         const slot = assignment[key]
//                         if (slot) {
//                             // Extract table number from slot (e.g., "mqv (Table 1)" -> "1")
//                             let tableNum = slot.substring(slot.indexOf(" ") + 1) // "(Table 1)"
//                             tableNum = tableNum.substring(tableNum.indexOf(" ") + 1) // "1)"
//                             tableNum = tableNum.replace(")", "") // "1"

//                             if (!assignmentsPerTable[tableNum]) {
//                                 assignmentsPerTable[tableNum] = 0
//                             }
//                             assignmentsPerTable[tableNum]++
//                         }
//                     }
//                 })
//             }
//         })

//         // Build leaderboard data
//         const leaderboardData = CsvfileTeams.map((team) => {
//             const tableNum = team.tableNumber
//             const completed = judgementsPerTable[tableNum] || 0
//             const total = assignmentsPerTable[tableNum] || 0

//             return {
//                 teamName: team.teamName,
//                 tableNumber: team.tableNumber,
//                 roomNumber: team.roomNumber,
//                 category: team.categoryApplied,
//                 completed: completed,
//                 total: total,
//                 percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
//             }
//         })

//         // Sort by completion percentage (highest first), then by completed count
//         leaderboardData.sort((a, b) => {
//             if (b.percentage !== a.percentage) {
//                 return b.percentage - a.percentage
//             }
//             return b.completed - a.completed
//         })

//         // Calculate overall stats
//         const totalTeams = leaderboardData.length
//         const totalCompleted = leaderboardData.reduce((sum, team) => sum + team.completed, 0)
//         const totalAssignments = leaderboardData.reduce((sum, team) => sum + team.total, 0)
//         const fullyEvaluated = leaderboardData.filter((team) => team.completed === team.total && team.total > 0).length

//         res.render("leaderboard.ejs", {
//             teams: leaderboardData,
//             stats: {
//                 totalTeams,
//                 totalCompleted,
//                 totalAssignments,
//                 fullyEvaluated,
//             },
//             currentPage: "leaderboard",
//         })
//     } catch (error) {
//         console.error("Error generating leaderboard:", error)
//         res.redirect("/404")
//     }
// })

app.use("/auth", authRouter);
app.use("/", dashboardRouter);
app.use("/", checkinRouter);

//data management routes (DO NOT TOUCH)
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
                    MLH: team.MLH || "",
                    ProjectLink: team.SubUrl,
                    HardwareJudge: team.HardwareJudge.toLowerCase() == "true" ? true : false || false,
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

app.get("/generate_assignments", ensureAuthenticated, async (req, res) => {
    // judges from judges_auth.csv as name and email and make sure hardware is false
    let nonHardwareJudges = CsvfileJudges.filter(judge => judge.Hardware.toLowerCase() == "false")
    nonHardwareJudges = nonHardwareJudges.map(judge => ({
        name: judge.Judge,
        email: judge.Judge_Email
    }))
    let hardwareJudges = CsvfileJudges.filter(judge => judge.Hardware.toLowerCase() == "true")
    hardwareJudges = hardwareJudges.map(judge => ({
        name: judge.Judge,
        email: judge.Judge_Email
    }))
    // get teams from teams schema who have checkin1 and checkin2 as true
    const nonHardwareteams = await teamSchema.find({ checkin1: true, checkin2: true, HardwareJudge: false })
    const hardwareTeams = await teamSchema.find({ checkin1: true, checkin2: true, HardwareJudge: true })
    // only give name and table number
    const mappedNonHardwareTeams = nonHardwareteams.map(team => ({
        name: team.ProjectName,
        tableNumber: team.TableNumber
    }))
    const mappedHardwareTeams = hardwareTeams.map(team => ({
        name: team.ProjectName,
        tableNumber: team.TableNumber
    }))

    const NonHardwareAssignments = generateJudgingAssignments({
        teams: mappedNonHardwareTeams,
        judges: nonHardwareJudges,
        judgingsPerProject: 3,
        numRooms: ROOM_CONFIG.length - 1, // exclude hardware room
        roomCapacities: ROOM_CONFIG.slice(0, -1).map(room => room.capacity),
        maxAttempts: 10
    })

    const HardwareAssignments = generateJudgingAssignments({
        teams: mappedHardwareTeams,
        judges: hardwareJudges,
        judgingsPerProject: 3,
        numRooms: 1, // hardware room only
        roomCapacities: [ROOM_CONFIG[ROOM_CONFIG.length - 1].capacity],
        maxAttempts: 10
    })

    // find the judge as user in userSchema and update their current assignments to the generated ones, and if not found create a new user
    for (const assignment of NonHardwareAssignments.assignments) {
        let user = await userSchema.findOne({ name: assignment.name })
        console.log("Processing assignment for judge:", assignment.name)
        if (!user) {
            const judge = CsvfileJudges.find(j => j.Judge === assignment.name)
            user = new userSchema({
                name: judge.Judge,
                email: judge.Judge_Email,
                assignedProjects: assignment.assignments,
                currentProject: 1,
                tutorialCompleted: false,
                tutorialCurrentProject: 1
            })
        } else {
            user.assignedProjects = assignment.assignments
        }
        await user.save()
    }

    for (const assignment of HardwareAssignments.assignments) {
        let user = await userSchema.findOne({ name: assignment.name })
        console.log("Processing assignment for judge:", assignment.name)
        if (!user) {
            const judge = CsvfileJudges.find(j => j.Judge === assignment.name)
            user = new userSchema({
                name: judge.Judge,
                email: judge.Judge_Email,
                assignedProjects: assignment.assignments,
                currentProject: 1,
                tutorialCompleted: false,
                tutorialCurrentProject: 1
            })
        } else {
            user.assignedProjects = assignment.assignments
        }
        await user.save()
    }

    res.json({
        success: true,
        nonHardwareAssignments: NonHardwareAssignments,
        hardwareAssignments: HardwareAssignments
    })
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
            bouncedEmails: bouncedEmails,
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

app.get("/checkin-has-failed", ensureAuthenticated, async (req, res) => {
    //assign each team a table number according to the room capacities defined in ROOM_CONFIG and mark them as checked in. Make sure hardware teams go to the hardware room
    try {
        const teams = await teamSchema.find({ })
        let processedCount = 0
        for (const team of teams) {
            const isHardware = team.HardwareJudge
            const assignment = await getNextAvailableTable(isHardware)
            team.TableNumber = assignment.tableNumber
            team.RoomNumber = assignment.roomNumber
            team.checkin1 = true
            team.checkin2 = true //also mark checkin2 as complete since they couldn't do it
            await team.save()
            processedCount++
        }
        res.json({
            success: true,
            message: `Processed ${processedCount} teams and assigned table numbers.`,
        })
    } catch (error) {
        console.error("[v0] Error in checkin-has-failed route:", error)
        res.status(500).json({
            success: false,
            message: "Error processing teams",
            error: error.message,
        })
    }
})

app.get("/update-bias-scores", ensureAuthenticated, async (req, res) => {
    res.send("Not implemented yet")
})

// // catch-all route: use '/*' so path-to-regexp treats it as a valid wildcard
app.use((req, res) => {
    res.redirect("/404")
})

//listen
app.listen(PORT, () => console.log(`Connected on port ${PORT}`))