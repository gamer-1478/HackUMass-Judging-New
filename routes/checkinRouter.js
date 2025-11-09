require('dotenv').config();
const router = require('express').Router();
const teamSchema = require('../schemas/teamSchema');
const crypto = require("crypto");
const QRCode = require("qrcode")
const sgMail = require("@sendgrid/mail")
const client = require("@sendgrid/client");
const { ensureAuthenticated } = require('../middleware/auth');
client.setApiKey(process.env.SENDGRID_API_KEY)
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

router.get("/checkin1", ensureAuthenticated, (req, res) => {
    res.render("checkin1-admin.ejs", { currentPage: "checkin1" })
})

const ROOM_CONFIG = [
    { roomNumber: 1, capacity: 33 }, // S110
    { roomNumber: 2, capacity: 49 }, // S131
    { roomNumber: 3, capacity: 33 }, // S120
    { roomNumber: 4, capacity: 40 }, // S140
    { roomNumber: 5, capacity: 22 }, // N101
    { roomNumber: 6, capacity: 31 }, // Hardware room - last room N155
]

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

        const previousRoomsCapacity = ROOM_CONFIG.slice(0, -1).reduce((sum, r) => sum + r.capacity, 0)

        return {
            tableNumber: previousRoomsCapacity + teamsInHardwareRoom + 1,
            roomNumber: hardwareRoom.roomNumber,
        }
    }

    const regularRooms = ROOM_CONFIG.slice(0, -1) // All rooms except last one

    for (let i = 0; i < regularRooms.length; i++) {
        const room = regularRooms[i]
        // Use session to ensure count is done within transaction
        const teamsInRoom = await teamSchema
            .countDocuments({
                checkin1: true,
                RoomNumber: room.roomNumber,
            })
            .session(session)

        if (teamsInRoom < room.capacity) {
            const previousRoomsCapacity = regularRooms.slice(0, i).reduce((sum, r) => sum + r.capacity, 0)

            return {
                tableNumber: previousRoomsCapacity + teamsInRoom + 1,
                roomNumber: room.roomNumber,
            }
        }
    }

    throw new Error("All regular rooms are full. Please contact organizers.")
}

router.post("/api/checkin1", ensureAuthenticated, async (req, res) => {
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

            const isHardware = team.HardwareJudge
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
                roomNumber: roomNumberToName(assignment.roomNumber),
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
                roomNumber: roomNumberToName(assignment.roomNumber),
                teamName: team.ProjectName,
            })
        } catch (error) {
            console.error("[v0] Error in checkin1:", error)
            res.json({ success: false, message: "Check-in failed. Please try again." })
        }
    }
    return res.json({ success: false, message: "Check-in failed after multiple attempts. Please try again." })
})

router.get("/checkin2/:base64email", async (req, res) => {
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
            roomNumber: roomNumberToName(team.RoomNumber),
            currentPage: "checkin2",
        })
    } catch (error) {
        console.error("[v0] Error in checkin2 page:", error)
        //res.redirect("/404")
    }
})

router.post("/api/checkin2", async (req, res) => {
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

module.exports = router;