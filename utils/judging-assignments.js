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
        // Capacity represents max number of judges that can fit in this room at once
        // If not specified, defaults to the number of projects in the room
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
        const projectsPerRoom = Math.ceil(this.totalProjects / this.numRooms)
        const rooms = []

        for (let i = 0; i < this.numRooms; i++) {
            const startIdx = i * projectsPerRoom + 1
            const endIdx = Math.min((i + 1) * projectsPerRoom + 1, this.totalProjects + 1)
            const projectRange = []

            for (let j = startIdx; j < endIdx; j++) {
                projectRange.push(j)
            }

            // If roomCapacities is provided, use it; otherwise default to project range length
            const capacity = this.roomCapacities && this.roomCapacities[i] ? this.roomCapacities[i] : projectRange.length

            const room = new Room(i + 1, projectRange, capacity)
            rooms.push(room)
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
        // Store all judge assignments as they are being built
        this.assignments = []
        // Track how many times each project has been assigned
        this.projectCounts = {}
        // Track how many assignments each judge has received
        this.judgeCounts = {}

        // Initialize project counts (all start at 0)
        for (let i = 1; i <= system.totalProjects; i++) {
            this.projectCounts[i] = 0
        }
        // Initialize judge counts (all start at 0)
        for (let i = 0; i < system.numJudges; i++) {
            this.judgeCounts[i] = 0
        }

        // Calculate total number of judgings needed across all projects
        // Example: 50 projects × 3 judgings each = 150 total judgings
        this.totalJudgings = system.totalProjects * system.judgingsPerProject

        // Calculate base assignments per judge (divide total work evenly)
        // Example: 150 judgings ÷ 20 judges = 7.5 → base = 7
        this.basePerJudge = Math.floor(this.totalJudgings / system.numJudges)
        // Calculate remaining assignments that need to be distributed
        // Example: 150 % 20 = 10 extra assignments to distribute
        this.extraAssignments = this.totalJudgings % system.numJudges

        // Distribute judges to rooms proportionally based on their capacity
        this.judgesPerRoom = this._calculateJudgesPerRoom()

        // Assign each judge to a starting room
        // This creates an array where each element is a room index
        // Example: [0, 0, 1, 1, 2, 3, 3, ...] means first two judges start in room 0, etc.
        this.initialRoomAssignments = []
        for (let roomIdx = 0; roomIdx < system.numRooms; roomIdx++) {
            for (let j = 0; j < this.judgesPerRoom[roomIdx]; j++) {
                this.initialRoomAssignments.push(roomIdx)
            }
        }
        // Shuffle to randomize which specific judges go to which rooms
        this._shuffleArray(this.initialRoomAssignments)

        // Calculate maximum assignments any single judge will receive
        // Example: base 7 + 1 extra = 8 max per judge
        this.maxPerJudge = this.basePerJudge + (this.extraAssignments > 0 ? 1 : 0)
        // Calculate how many projects to judge in each room phase
        // Each judge rotates through all rooms, judging some projects in each
        // Example: 8 total ÷ 4 rooms = 2 projects per room
        this.teamsPerPhase = Math.ceil(this.maxPerJudge / system.numRooms)
    }

    /**
     * Distributes judges across rooms proportionally to each room's capacity.
     * Rooms with higher capacity can accommodate more judges simultaneously.
     *
     * Algorithm:
     * 1. Calculate total capacity across all rooms
     * 2. Allocate judges proportionally: (roomCapacity / totalCapacity) × totalJudges
     * 3. Handle remainders by assigning extra judges to rooms with largest fractional parts
     * 4. Ensure no room exceeds its capacity
     */
    _calculateJudgesPerRoom() {
        const totalCapacity = this.system.rooms.reduce((sum, room) => sum + room.capacity, 0)
        const judgesPerRoom = []
        let assignedJudges = 0
        const fractionalParts = []

        // First pass: Calculate base allocation and track fractional parts
        for (let i = 0; i < this.system.numRooms; i++) {
            const room = this.system.rooms[i]
            // Calculate proportional allocation
            const idealAllocation = (room.capacity / totalCapacity) * this.system.numJudges
            // Take the floor for base allocation
            const baseAllocation = Math.floor(idealAllocation)
            // Cap at room capacity
            const allocation = Math.min(baseAllocation, room.capacity)

            judgesPerRoom.push(allocation)
            assignedJudges += allocation
            // Store fractional part for tie-breaking
            fractionalParts.push({ roomIdx: i, fraction: idealAllocation - baseAllocation })
        }

        // Second pass: Distribute remaining judges to rooms with largest fractional parts
        // Sort rooms by their fractional parts (descending)
        fractionalParts.sort((a, b) => b.fraction - a.fraction)

        let remainingJudges = this.system.numJudges - assignedJudges
        for (const { roomIdx } of fractionalParts) {
            if (remainingJudges === 0) break
            // Only add if room hasn't reached capacity
            if (judgesPerRoom[roomIdx] < this.system.rooms[roomIdx].capacity) {
                judgesPerRoom[roomIdx]++
                remainingJudges--
            }
        }

        return judgesPerRoom
    }

    // Fisher-Yates shuffle algorithm for randomizing arrays
    _shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
                ;[array[i], array[j]] = [array[j], array[i]]
        }
    }

    /**
     * Calculates target number of assignments for a specific judge.
     * Distributes extra assignments to the first N judges where N is the remainder.
     *
     * Example: 150 judgings ÷ 20 judges = 7 base + 10 extra
     * - Judges 0-9 get: 7 + 1 = 8 assignments
     * - Judges 10-19 get: 7 assignments
     */
    _getTargetAssignments(judgeId) {
        return this.basePerJudge + (judgeId < this.extraAssignments ? 1 : 0)
    }

    /**
     * Core assignment algorithm - creates balanced project assignments for all judges.
     *
     * HIGH-LEVEL OVERVIEW:
     * This function ensures every project is judged the correct number of times while:
     * 1. Balancing workload evenly across judges
     * 2. Preventing judges from being at the same table simultaneously
     * 3. Having judges rotate through all rooms
     * 4. Respecting room capacities
     *
     * ALGORITHM STEPS:
     *
     * FOR EACH JUDGE (judgeId):
     *   1. Determine their starting room (from initial room assignments)
     *   2. Calculate how many projects they need to judge (target assignments)
     *
     *   FOR EACH PHASE (judges rotate through all rooms):
     *     3. Determine current room (rotating from their start room)
     *     4. Get list of projects in this room
     *     5. Calculate how many projects to assign in this phase
     *
     *     FOR EACH SLOT in this phase:
     *       6. Determine the absolute time slot index across all phases
     *
     *       COLLISION AVOIDANCE:
     *       7. Build set of projects already assigned at this time slot
     *          (Check what all previous judges are doing at this same time)
     *          This prevents multiple judges from being at same table simultaneously
     *
     *       TEAM SELECTION:
     *       8. Find available teams in current room that:
     *          - Haven't been assigned at this time slot (no collision)
     *          - Haven't reached their required judging count
     *
     *       9. If no teams available in current room, search other rooms
     *
     *       10. Select team with lowest judging count (balance assignments)
     *
     *       11. Record assignment and update counts
     *
     * KEY DATA STRUCTURES:
     * - this.assignments: 2D array [judgeId][slotIndex] = projectTableNumber
     * - this.projectCounts: How many times each project has been assigned
     * - currentSlotAssignments: Set of projects assigned at current time slot (prevents collisions)
     * - roomTeams: Projects available in current room (gets filtered as teams are assigned)
     *
     * EXAMPLE EXECUTION (simplified):
     * Judge 0 starts in Room 1:
     *   Phase 0 (Room 1): Assigns projects 1, 2
     *   Phase 1 (Room 2): Assigns projects 11, 12
     *   Phase 2 (Room 3): Assigns projects 21, 22
     *   Phase 3 (Room 4): Assigns projects 31, 32
     *
     * At each slot, checks: "Is any other judge already assigned to this project right now?"
     */
    _createBalancedAssignments() {
        // Iterate through each judge to build their complete schedule
        for (let judgeId = 0; judgeId < this.system.numJudges; judgeId++) {
            // Initialize empty assignment list for this judge
            const judgeAssignments = []
            // Get this judge's starting room (from initial random distribution)
            const startRoom = this.initialRoomAssignments[judgeId]
            // Calculate total assignments needed for this judge
            const targetAssignments = this._getTargetAssignments(judgeId)
            // Track how many more assignments this judge needs
            let remainingAssignments = targetAssignments

            // PHASE LOOP: Judge rotates through all rooms
            // Example: If starting in Room 2 with 4 total rooms
            //   Phase 0: Room 2, Phase 1: Room 3, Phase 2: Room 0, Phase 3: Room 1
            for (let phase = 0; phase < this.system.numRooms; phase++) {
                // Calculate current room using circular rotation
                const currentRoom = (startRoom + phase) % this.system.numRooms
                // Get projects available in this room (copy array to avoid mutations)
                const roomTeams = [...this.system.rooms[currentRoom].projects]
                // Calculate how many projects to assign in this phase (may be less in final phase)
                const slotsThisPhase = Math.min(this.teamsPerPhase, remainingAssignments)

                // SLOT LOOP: Assign specific projects in this phase
                for (let slot = 0; slot < slotsThisPhase; slot++) {
                    // Calculate absolute time slot across all phases
                    // This is crucial for detecting collisions across all judges
                    const currentSlot = judgeAssignments.length

                    // COLLISION DETECTION: Build set of projects assigned at this exact time slot
                    // Check all previously assigned judges to see what they're doing right now
                    const currentSlotAssignments = new Set()
                    for (const prevJudgeAssignments of this.assignments) {
                        // Only check if previous judge has an assignment at this time
                        if (currentSlot < prevJudgeAssignments.length) {
                            currentSlotAssignments.add(prevJudgeAssignments[currentSlot])
                        }
                    }

                    // TEAM SELECTION: Find available teams in current room
                    // Teams must: (1) not be assigned at this time slot, (2) need more judgings
                    let availableTeams = this._getAvailableTeams(roomTeams, currentSlotAssignments)

                    // FALLBACK: If no teams available in current room, search other rooms
                    // This can happen if current room is small or all projects fully judged
                    if (availableTeams.length === 0) {
                        for (const otherRoom of this.system.rooms) {
                            // Skip the room we already checked
                            if (JSON.stringify(otherRoom.projects) !== JSON.stringify(roomTeams)) {
                                availableTeams = this._getAvailableTeams(otherRoom.projects, currentSlotAssignments)
                                if (availableTeams.length > 0) {
                                    break
                                }
                            }
                        }
                    }

                    // ASSIGNMENT: Select and record team assignment
                    if (availableTeams.length > 0) {
                        // Choose team with lowest judging count to balance assignments
                        const team = availableTeams.reduce((min, t) => (this.projectCounts[t] < this.projectCounts[min] ? t : min))

                        // Record assignment
                        judgeAssignments.push(team)
                        // Update counters
                        this.projectCounts[team]++
                        this.judgeCounts[judgeId]++
                        remainingAssignments--

                        // Remove assigned team from room pool (can't assign same team twice in this phase)
                        const teamIdx = roomTeams.indexOf(team)
                        if (teamIdx !== -1) {
                            roomTeams.splice(teamIdx, 1)
                        }
                    } else {
                        // No available teams - mark as empty slot (-1)
                        judgeAssignments.push(-1)
                    }
                }
            }

            // Add this judge's complete assignment schedule to master list
            this.assignments.push(judgeAssignments)
        }
    }

    /**
     * Filters projects to find those available for assignment at current time slot.
     *
     * A project is available if:
     * 1. It exists in the room we're considering
     * 2. It's not already assigned to another judge at this exact time slot (no collision)
     * 3. It hasn't reached its required number of judgings yet
     *
     * @param {Array} roomTeams - Project table numbers in the room being considered
     * @param {Set} currentSlotAssignments - Projects already assigned at this time slot
     * @returns {Array} - Filtered list of available project table numbers
     */
    _getAvailableTeams(roomTeams, currentSlotAssignments) {
        const available = []
        for (const team of roomTeams) {
            // Check: Not assigned at this time AND needs more judgings
            if (!currentSlotAssignments.has(team) && this.projectCounts[team] < this.system.judgingsPerProject) {
                available.push(team)
            }
        }
        return available
    }

    _createAssignmentDataFrame() {
        // Find max number of teams assigned to any judge
        const maxTeams = Math.max(...this.assignments.map((arr) => arr.filter((x) => x !== -1).length))

        // Create CSV data
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

    generateAssignments() {
        this._createBalancedAssignments()
        return this._createAssignmentDataFrame()
    }
}

// ============================================================================
// Assignment Verifier
// ============================================================================

class AssignmentVerifier {
    constructor(data, system) {
        this.data = data
        this.system = system
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
        for (let i = 1; i <= this.system.totalProjects; i++) {
            const count = projectCounts[i] || 0
            if (count !== this.system.judgingsPerProject) {
                issues.push(`Project ${i} is judged ${count} times (should be ${this.system.judgingsPerProject})`)
            }
        }

        return issues
    }

    _verifySimultaneousJudging() {
        const issues = []
        const slotKeys = Object.keys(this.data[0]).filter((key) => key.startsWith("Slot"))

        // Check each time slot
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

            // Check for duplicate table assignments in this slot
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

        // Get first slot (starting position) for each judge
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

        // Check for any judges starting at the same table
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
        issues.push(...this._verifyJudgingCount())
        issues.push(...this._verifySimultaneousJudging())
        issues.push(...this._verifyNoJudgesStartAtSameTable())
        issues.push(...this._verifyJudgeWorkload())

        return { success: issues.length === 0, issues }
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
    roomCapacities = null, // New parameter for variable room capacities
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

    // Initialize system
    const system = new JudgingSystem(numRooms, judgingsPerProject, demoMode, numJudges, totalProjects, roomCapacities)

    console.log(`\n[v0] Initialized system with ${system.numJudges} judges and ${system.totalProjects} projects`)
    console.log("[v0] Room configuration:")
    for (const room of system.rooms) {
        console.log(`  Room ${room.roomId}: ${room.projects.length} projects, capacity: ${room.capacity} judges`)
    }

    // Generate and verify assignments with retries
    let attempt = 1
    let success = false
    let finalData = null

    while (attempt <= maxAttempts && !success) {
        console.log(`\n[v0] Attempt ${attempt} of ${maxAttempts}`)

        const generator = new AssignmentGenerator(system)
        const data = generator.generateAssignments()

        const verifier = new AssignmentVerifier(data, system)
        const result = verifier.verifyAll()

        success = result.success

        if (success) {
            console.log("[v0] All verifications passed successfully!")
            console.log("  ✓ All projects judged correct number of times")
            console.log("  ✓ No judges at same table simultaneously")
            console.log("  ✓ No judges start at same table")
            console.log("  ✓ Workload balanced across judges")
            finalData = data
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

    // Save final assignments
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
    demoMode: true, // Toggle demo mode on/off
    judgingsPerProject: 3, // Number of times each project is judged
    numRooms: 4, // Number of judging rooms
    numJudges: 20, // Number of judges (used in demo mode)
    totalProjects: 50, // Total number of projects (used in demo mode)
    roomCapacities: [8, 12, 6, 10], // Optional: Specify capacity for each room (max judges at once)
    maxAttempts: 10, // Maximum retry attempts
    saveToFile: true, // Save results to CSV file
    outputFile: "assignments.csv", // Output file name
})
