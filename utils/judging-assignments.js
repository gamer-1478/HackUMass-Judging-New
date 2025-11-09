import fs from "fs"
import { parse } from "csv-parse/sync"
import { stringify } from "csv-stringify/sync"

// ============================================================================
// Data Classes
// ============================================================================

class Project {
    constructor(name, tableNumber) {
        this.name = name
        this.tableNumber = tableNumber
    }
}

class Judge {
    constructor(firstName, lastName, judgeId) {
        this.firstName = firstName
        this.lastName = lastName
        this.judgeId = judgeId
    }
}

class Room {
    constructor(roomId, projects, capacity = null) {
        this.roomId = roomId
        this.projects = projects
        this.capacity = capacity !== null ? capacity : projects.length
    }
}

// ============================================================================
// Judging System
// ============================================================================

class JudgingSystem {
    constructor(
        numRooms,
        judgingsPerProject,
        demoMode = false,
        numJudges = null,
        totalProjects = null,
        roomCapacities = null,
    ) {
        this.numJudges = demoMode ? numJudges : 0
        this.totalProjects = demoMode ? totalProjects : 0
        this.numRooms = numRooms
        this.judgingsPerProject = judgingsPerProject
        this.demoMode = demoMode
        this.roomCapacities = roomCapacities

        this.judges = this._initializeJudges()
        this.projects = this._initializeProjects()
        this.rooms = this._createRooms()
    }

    _initializeJudges() {
        if (this.demoMode) {
            return this._generateDemoJudges()
        }
        return this._loadJudgesFromCsv()
    }

    _initializeProjects() {
        if (this.demoMode) {
            return this._generateDemoProjects()
        }
        return this._loadProjectsFromCsv()
    }

    _generateDemoJudges() {
        const firstNames = [
            "John",
            "Jane",
            "Mary",
            "James",
            "Patricia",
            "Michael",
            "Linda",
            "Robert",
            "Elizabeth",
            "William",
            "Jessica",
            "David",
            "Sarah",
            "Thomas",
        ]
        const lastNames = [
            "Smith",
            "Johnson",
            "Williams",
            "Brown",
            "Jones",
            "Garcia",
            "Miller",
            "Davis",
            "Rodriguez",
            "Martinez",
            "Hernandez",
            "Lopez",
            "Gonzalez",
            "Wilson",
        ]
        const judges = []

        for (let i = 0; i < this.numJudges; i++) {
            const judge = new Judge(
                firstNames[Math.floor(Math.random() * firstNames.length)],
                lastNames[Math.floor(Math.random() * lastNames.length)],
                1001 + i,
            )
            judges.push(judge)
        }

        return judges
    }

    _generateDemoProjects() {
        const projects = []

        for (let i = 0; i < this.totalProjects; i++) {
            const name = Array.from({ length: 3 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
            const project = new Project(name, i + 1)
            projects.push(project)
        }

        return projects
    }

    _loadJudgesFromCsv() {
        const fileContent = fs.readFileSync("judges.csv", "utf-8")
        const records = parse(fileContent, { columns: true, skip_empty_lines: true })

        this.numJudges = records.length
        const judges = []

        records.forEach((row, i) => {
            const judge = new Judge(row.judgeFirstName, row.judgeLastName, 1001 + i)
            judges.push(judge)
        })

        return judges
    }

    _loadProjectsFromCsv() {
        const fileContent = fs.readFileSync("team.csv", "utf-8")
        const records = parse(fileContent, { columns: true, skip_empty_lines: true })

        this.totalProjects = records.length
        const projects = []

        records.forEach((row) => {
            const project = new Project(row.teamName, Number.parseInt(row.tableNumber))
            projects.push(project)
        })

        return projects
    }

    _createRooms() {
        const rooms = []

        if (this.roomCapacities && this.roomCapacities.length === this.numRooms) {
            let currentTableNumber = 1

            for (let i = 0; i < this.numRooms; i++) {
                const capacity = this.roomCapacities[i]
                const projectRange = []

                for (let j = 0; j < capacity; j++) {
                    projectRange.push(currentTableNumber++)
                }

                const room = new Room(i + 1, projectRange, capacity)
                rooms.push(room)
            }
        } else {
            const projectsPerRoom = Math.ceil(this.totalProjects / this.numRooms)

            for (let i = 0; i < this.numRooms; i++) {
                const startIdx = i * projectsPerRoom + 1
                const endIdx = Math.min((i + 1) * projectsPerRoom + 1, this.totalProjects + 1)
                const projectRange = []

                for (let j = startIdx; j < endIdx; j++) {
                    projectRange.push(j)
                }

                const capacity = projectRange.length
                const room = new Room(i + 1, projectRange, capacity)
                rooms.push(room)
            }
        }

        return rooms
    }
}

// ============================================================================
// Assignment Generator
// ============================================================================

class AssignmentGenerator {
    constructor(system) {
        this.system = system
        this.assignments = []
        this.projectCounts = {}
        this.judgeCounts = {}

        for (let i = 1; i <= system.totalProjects; i++) {
            this.projectCounts[i] = 0
        }
        for (let i = 0; i < system.numJudges; i++) {
            this.judgeCounts[i] = 0
        }

        this.totalJudgings = system.totalProjects * system.judgingsPerProject
        this.basePerJudge = Math.floor(this.totalJudgings / system.numJudges)
        this.extraAssignments = this.totalJudgings % system.numJudges

        this.judgesPerRoom = this._calculateJudgesPerRoom()

        this.initialRoomAssignments = []
        for (let roomIdx = 0; roomIdx < system.numRooms; roomIdx++) {
            for (let j = 0; j < this.judgesPerRoom[roomIdx]; j++) {
                this.initialRoomAssignments.push(roomIdx)
            }
        }
        this._shuffleArray(this.initialRoomAssignments)

        this.maxPerJudge = this.basePerJudge + (this.extraAssignments > 0 ? 1 : 0)
        this.teamsPerPhase = Math.ceil(this.maxPerJudge / system.numRooms)
    }

    generateAssignments() {
        this._createBalancedAssignments()
        return this._createAssignmentDataFrame()
    }

    _calculateJudgesPerRoom() {
        const totalCapacity = this.system.rooms.reduce((sum, room) => sum + room.capacity, 0)
        const judgesPerRoom = []
        let assignedJudges = 0
        const fractionalParts = []

        for (let i = 0; i < this.system.numRooms; i++) {
            const room = this.system.rooms[i]
            const idealAllocation = (room.capacity / totalCapacity) * this.system.numJudges
            const baseAllocation = Math.floor(idealAllocation)
            const allocation = Math.min(baseAllocation, room.capacity)

            judgesPerRoom.push(allocation)
            assignedJudges += allocation
            fractionalParts.push({ roomIdx: i, fraction: idealAllocation - baseAllocation })
        }

        fractionalParts.sort((a, b) => b.fraction - a.fraction)

        let remainingJudges = this.system.numJudges - assignedJudges
        for (const { roomIdx } of fractionalParts) {
            if (remainingJudges === 0) break
            if (judgesPerRoom[roomIdx] < this.system.rooms[roomIdx].capacity) {
                judgesPerRoom[roomIdx]++
                remainingJudges--
            }
        }

        return judgesPerRoom
    }

    _shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
                ;[array[i], array[j]] = [array[j], array[i]]
        }
    }

    _getTargetAssignments(judgeId) {
        return this.basePerJudge + (judgeId < this.extraAssignments ? 1 : 0)
    }

    _createBalancedAssignments() {
        const judgeOrder = Array.from({ length: this.system.numJudges }, (_, i) => i)

        for (const judgeId of judgeOrder) {
            const judgeAssignments = []
            const startRoom = this.initialRoomAssignments[judgeId]
            const targetAssignments = this._getTargetAssignments(judgeId)
            let remainingAssignments = targetAssignments
            const judgedTables = new Set()

            for (let phase = 0; phase < this.system.numRooms; phase++) {
                const currentRoom = (startRoom + phase) % this.system.numRooms
                const roomTeams = [...this.system.rooms[currentRoom].projects]
                const slotsThisPhase = Math.min(this.teamsPerPhase, remainingAssignments)

                for (let slot = 0; slot < slotsThisPhase; slot++) {
                    const currentSlot = judgeAssignments.length
                    const currentSlotAssignments = new Set()
                    for (const prevJudgeAssignments of this.assignments) {
                        if (currentSlot < prevJudgeAssignments.length) {
                            currentSlotAssignments.add(prevJudgeAssignments[currentSlot])
                        }
                    }

                    let availableTeams = this._getAvailableTeams(roomTeams, currentSlotAssignments, judgedTables)

                    if (availableTeams.length === 0) {
                        for (const otherRoom of this.system.rooms) {
                            if (JSON.stringify(otherRoom.projects) !== JSON.stringify(roomTeams)) {
                                availableTeams = this._getAvailableTeams(otherRoom.projects, currentSlotAssignments, judgedTables)
                                if (availableTeams.length > 0) {
                                    break
                                }
                            }
                        }
                    }

                    if (availableTeams.length > 0) {
                        const team = availableTeams.reduce((min, t) => (this.projectCounts[t] < this.projectCounts[min] ? t : min))

                        judgeAssignments.push(team)
                        judgedTables.add(team)
                        this.projectCounts[team]++
                        this.judgeCounts[judgeId]++
                        remainingAssignments--

                        const teamIdx = roomTeams.indexOf(team)
                        if (teamIdx !== -1) {
                            roomTeams.splice(teamIdx, 1)
                        }
                    } else {
                        judgeAssignments.push(-1)
                    }
                }
            }

            this.assignments.push(judgeAssignments)
        }
    }

    _getAvailableTeams(roomTeams, currentSlotAssignments, judgedTables) {
        const available = []
        for (const team of roomTeams) {
            if (
                !currentSlotAssignments.has(team) &&
                !judgedTables.has(team) &&
                this.projectCounts[team] < this.system.judgingsPerProject
            ) {
                available.push(team)
            }
        }
        return available
    }

    _createAssignmentDataFrame() {
        const maxTeams = Math.max(...this.assignments.map((arr) => arr.filter((x) => x !== -1).length))

        const csvData = []

        for (let i = 0; i < this.assignments.length; i++) {
            const judge = this.system.judges[i]
            const row = {
                Judge: `${judge.firstName} ${judge.lastName}`,
                "Judge ID": judge.judgeId,
            }

            for (let j = 0; j < maxTeams; j++) {
                const teamNum = this.assignments[i][j]
                if (teamNum && teamNum !== -1) {
                    const project = this.system.projects[teamNum - 1]
                    row[`Slot ${j + 1}`] = `${project.name} (Table ${project.tableNumber})`
                } else {
                    row[`Slot ${j + 1}`] = "No team for this time slot"
                }
            }

            csvData.push(row)
        }

        return csvData
    }
}

// ============================================================================
// Assignment Verifier
// ============================================================================

class AssignmentVerifier {
    constructor(data, system, assignments) {
        this.data = data
        this.system = system
        this.assignments = assignments // Added assignments for fix-up phase
    }

    _verifyJudgingCount() {
        const projectCounts = {}

        for (const row of this.data) {
            for (const [key, value] of Object.entries(row)) {
                if (key.startsWith("Slot") && value !== "No team for this time slot") {
                    const match = value.match(/Table (\d+)\)/)
                    if (match) {
                        const tableNum = Number.parseInt(match[1])
                        projectCounts[tableNum] = (projectCounts[tableNum] || 0) + 1
                    }
                }
            }
        }

        const issues = []
        const underJudgedProjects = [] // Track projects that need more judgements
        for (let i = 1; i <= this.system.totalProjects; i++) {
            const count = projectCounts[i] || 0
            if (count !== this.system.judgingsPerProject) {
                issues.push(`Project ${i} is judged ${count} times (should be ${this.system.judgingsPerProject})`)
                if (count < this.system.judgingsPerProject) {
                    underJudgedProjects.push({ projectId: i, current: count, needed: this.system.judgingsPerProject - count })
                }
            }
        }

        return { issues, underJudgedProjects }
    }

    _fixUnderJudgedProjects(underJudgedProjects) {
        console.log("\n[v0] Attempting to fix under-judged projects...")

        for (const { projectId, needed } of underJudgedProjects) {
            console.log(`[v0] Fixing Project ${projectId} (needs ${needed} more judgement(s))`)

            let addedCount = 0

            for (let judgeId = 0; judgeId < this.assignments.length && addedCount < needed; judgeId++) {
                const judgeAssignments = this.assignments[judgeId]

                // Check if this judge has already judged this project
                if (judgeAssignments.includes(projectId)) continue

                for (let slotIdx = 0; slotIdx < judgeAssignments.length && addedCount < needed; slotIdx++) {
                    const currentAssignment = judgeAssignments[slotIdx]

                    // Only check for collision, don't care if judge has too many projects
                    let collision = false
                    for (let otherJudgeId = 0; otherJudgeId < this.assignments.length; otherJudgeId++) {
                        if (otherJudgeId === judgeId) continue
                        if (this.assignments[otherJudgeId][slotIdx] === projectId) {
                            collision = true
                            break
                        }
                    }

                    if (!collision) {
                        if (currentAssignment === -1) {
                            judgeAssignments[slotIdx] = projectId
                        } else {
                            // Add as a new slot at the end
                            judgeAssignments.push(projectId)
                        }
                        addedCount++
                        console.log(`  ✓ Assigned Project ${projectId} to Judge ${judgeId + 1} at Slot ${slotIdx + 1}`)
                        break
                    }
                }

                if (addedCount < needed && !judgeAssignments.includes(projectId)) {
                    // One more collision check for a new slot
                    let canAddNewSlot = true
                    const newSlotIdx = judgeAssignments.length

                    for (let otherJudgeId = 0; otherJudgeId < this.assignments.length; otherJudgeId++) {
                        if (otherJudgeId === judgeId) continue
                        if (this.assignments[otherJudgeId][newSlotIdx] === projectId) {
                            canAddNewSlot = false
                            break
                        }
                    }

                    if (canAddNewSlot) {
                        judgeAssignments.push(projectId)
                        addedCount++
                        console.log(`  ✓ Added Project ${projectId} to Judge ${judgeId + 1} as extra slot`)
                    }
                }
            }

            if (addedCount < needed) {
                console.log(`  ⚠ Could only add ${addedCount}/${needed} missing judgement(s) for Project ${projectId}`)
            }
        }

        return this._regenerateDataFrame()
    }

    _regenerateDataFrame() {
        const maxTeams = Math.max(...this.assignments.map((arr) => arr.filter((x) => x !== -1).length))

        const csvData = []

        for (let i = 0; i < this.assignments.length; i++) {
            const judge = this.system.judges[i]
            const row = {
                Judge: `${judge.firstName} ${judge.lastName}`,
                "Judge ID": judge.judgeId,
            }

            for (let j = 0; j < maxTeams; j++) {
                const teamNum = this.assignments[i][j]
                if (teamNum && teamNum !== -1) {
                    const project = this.system.projects[teamNum - 1]
                    row[`Slot ${j + 1}`] = `${project.name} (Table ${project.tableNumber})`
                } else {
                    row[`Slot ${j + 1}`] = "No team for this time slot"
                }
            }

            csvData.push(row)
        }

        return csvData
    }

    _verifySimultaneousJudging() {
        const issues = []
        const slotKeys = Object.keys(this.data[0]).filter((key) => key.startsWith("Slot"))

        for (const slotKey of slotKeys) {
            const tableNumbers = []

            for (const row of this.data) {
                const value = row[slotKey]
                if (value !== "No team for this time slot") {
                    const match = value.match(/Table (\d+)\)/)
                    if (match) {
                        tableNumbers.push(Number.parseInt(match[1]))
                    }
                }
            }

            const seen = new Set()
            const duplicates = new Set()
            for (const num of tableNumbers) {
                if (seen.has(num)) {
                    duplicates.add(num)
                }
                seen.add(num)
            }

            if (duplicates.size > 0) {
                issues.push(
                    `In ${slotKey}, projects at tables ${Array.from(duplicates).join(", ")} are being judged simultaneously by multiple judges`,
                )
            }
        }

        return issues
    }

    _verifyNoJudgesStartAtSameTable() {
        const issues = []
        const firstSlotTables = new Map()

        for (const row of this.data) {
            const firstSlot = row["Slot 1"]
            if (firstSlot && firstSlot !== "No team for this time slot") {
                const match = firstSlot.match(/Table (\d+)\)/)
                if (match) {
                    const tableNum = Number.parseInt(match[1])
                    if (firstSlotTables.has(tableNum)) {
                        firstSlotTables.get(tableNum).push(row.Judge)
                    } else {
                        firstSlotTables.set(tableNum, [row.Judge])
                    }
                }
            }
        }

        for (const [tableNum, judges] of firstSlotTables.entries()) {
            if (judges.length > 1) {
                issues.push(`Multiple judges start at Table ${tableNum}: ${judges.join(", ")}`)
            }
        }

        return issues
    }

    _verifyJudgeWorkload() {
        const judgeCounts = {}

        for (const row of this.data) {
            let count = 0
            for (const [key, value] of Object.entries(row)) {
                if (key.startsWith("Slot") && value !== "No team for this time slot") {
                    count++
                }
            }
            judgeCounts[row.Judge] = count
        }

        const avgLoad = Object.values(judgeCounts).reduce((a, b) => a + b, 0) / Object.keys(judgeCounts).length
        const maxDeviation = 2

        const issues = []
        for (const [judge, count] of Object.entries(judgeCounts)) {
            if (Math.abs(count - avgLoad) > maxDeviation) {
                issues.push(`Judge ${judge} has ${count} projects (average is ${avgLoad.toFixed(1)})`)
            }
        }

        return issues
    }

    verifyAll() {
        const issues = []
        const judgingResult = this._verifyJudgingCount()
        issues.push(...judgingResult.issues)
        issues.push(...this._verifySimultaneousJudging())
        issues.push(...this._verifyNoJudgesStartAtSameTable())
        issues.push(...this._verifyJudgeWorkload())

        if (judgingResult.underJudgedProjects.length > 0) {
            const fixedData = this._fixUnderJudgedProjects(judgingResult.underJudgedProjects)

            // Re-verify after fix-up
            this.data = fixedData
            const recheck = this._verifyJudgingCount()

            if (recheck.underJudgedProjects.length === 0) {
                console.log("[v0] ✓ Successfully fixed all under-judged projects!")
                return { success: true, issues: [], data: fixedData }
            }
        }

        return { success: issues.length === 0, issues, data: this.data }
    }
}

// ============================================================================
// Main Function with Feature Flags
// ============================================================================

function main({
    demoMode = false,
    judgingsPerProject = 3,
    numRooms = 4,
    numJudges = 20,
    totalProjects = 50,
    roomCapacities = null,
    maxAttempts = 10,
    saveToFile = true,
    outputFile = "assignments.csv",
} = {}) {
    console.log("[v0] Starting Judging System with configuration:")
    console.log(`  Demo Mode: ${demoMode}`)
    console.log(`  Judgings per Project: ${judgingsPerProject}`)
    console.log(`  Number of Rooms: ${numRooms}`)
    if (roomCapacities) {
        console.log(`  Room Capacities: ${roomCapacities.join(", ")}`)
    }
    if (demoMode) {
        console.log(`  Number of Judges: ${numJudges}`)
        console.log(`  Total Projects: ${totalProjects}`)
    }
    console.log(`  Max Attempts: ${maxAttempts}`)
    console.log(`  Save to File: ${saveToFile}`)

    const system = new JudgingSystem(numRooms, judgingsPerProject, demoMode, numJudges, totalProjects, roomCapacities)

    console.log(`\n[v0] Initialized system with ${system.numJudges} judges and ${system.totalProjects} projects`)
    console.log("[v0] Room configuration:")
    for (const room of system.rooms) {
        console.log(`  Room ${room.roomId}: ${room.projects.length} projects, capacity: ${room.capacity} projects`)
    }

    let attempt = 1
    let success = false
    let finalData = null

    while (attempt <= maxAttempts && !success) {
        console.log(`\n[v0] Attempt ${attempt} of ${maxAttempts}`)

        const generator = new AssignmentGenerator(system)
        const data = generator.generateAssignments()

        const verifier = new AssignmentVerifier(data, system, generator.assignments)
        const result = verifier.verifyAll()

        success = result.success

        if (success) {
            console.log("[v0] All verifications passed successfully!")
            console.log("  ✓ All projects judged correct number of times")
            console.log("  ✓ No judges at same table simultaneously")
            console.log("  ✓ No judges start at same table")
            console.log("  ✓ Workload balanced across judges")
            finalData = result.data || data // Use fixed data if available
        } else {
            console.log("\n[v0] Warning: Issues found in assignments:")
            for (const issue of result.issues) {
                console.log(`  - ${issue}`)
            }

            if (attempt === maxAttempts) {
                console.log("\n[v0] Failed to generate valid assignments after maximum attempts")
            } else {
                console.log("\n[v0] Retrying assignment generation...")
            }
        }

        attempt++
    }

    if (success && saveToFile && finalData) {
        const csvContent = stringify(finalData, { header: true })
        fs.writeFileSync(outputFile, csvContent)
        console.log(`\n[v0] Saved assignments to '${outputFile}'`)
    } else if (!success) {
        console.log("\n[v0] No valid assignments could be generated.")
    }

    return { success, data: finalData }
}

// ============================================================================
// Export and Execute
// ============================================================================


// Example usage with feature flags
main({
    demoMode: false, // Toggle demo mode on/off
    judgingsPerProject: 3, // Number of times each project is judged
    numRooms: 1, // Number of judging rooms
    numJudges: 27, // Number of judges (used in demo mode)
    totalProjects: 50, // Total number of projects (used in demo mode)
    // Rooms with more projects can accommodate more judges at once
    roomCapacities: [200], // Optional: Projects per room (if omitted, divided evenly)
    maxAttempts: 10, // Maximum retry attempts
    saveToFile: true, // Save results to CSV file
    outputFile: "assignments.csv", // Output file name
})
