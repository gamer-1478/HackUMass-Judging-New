// ============================================================================
// Judging Assignment API - JSON Based
// ============================================================================

/**
 * Generates judging assignments from JSON input and returns JSON output
 *
 * @param {Object} config Configuration object
 * @param {Array} config.teams Array of team objects {name: string, tableNumber: number}
 * @param {Array} config.judges Array of judge objects {name: string}
 * @param {number} config.judgingsPerProject Number of times each project should be judged
 * @param {number} config.numRooms Number of judging rooms
 * @param {Array} [config.roomCapacities] Optional array of capacities for each room
 * @param {number} [config.maxAttempts=10] Maximum retry attempts
 * @returns {Object} {success: boolean, assignments: [{name: string, assignments: number[]}], issues: string[]}
 */
export function generateJudgingAssignments({
    teams,
    judges,
    judgingsPerProject,
    numRooms,
    roomCapacities = null,
    maxAttempts = 10,
}) {
    if (!teams || !Array.isArray(teams) || teams.length === 0) {
        return { success: false, assignments: [], issues: ["No teams provided"] }
    }
    if (!judges || !Array.isArray(judges) || judges.length === 0) {
        return { success: false, assignments: [], issues: ["No judges provided"] }
    }
    if (!judgingsPerProject || judgingsPerProject < 1) {
        return { success: false, assignments: [], issues: ["Invalid judgingsPerProject value"] }
    }
    if (!numRooms || numRooms < 1) {
        return { success: false, assignments: [], issues: ["Invalid numRooms value"] }
    }

    const tableNumberToProject = {}
    for (const team of teams) {
        if (!team.tableNumber) {
            return { success: false, assignments: [], issues: [`Team "${team.name}" missing tableNumber`] }
        }
        tableNumberToProject[team.tableNumber] = {
            name: team.name,
            tableNumber: team.tableNumber,
        }
    }

    // Initialize system
    const system = {
        judges: judges.map((j, idx) => ({
            name: j.name,
            judgeId: 1001 + idx,
        })),
        projects: teams.map((t) => ({
            name: t.name,
            tableNumber: t.tableNumber,
        })),
        numJudges: judges.length,
        totalProjects: teams.length,
        numRooms,
        judgingsPerProject,
        roomCapacities,
        tableNumberToProject, // Add mapping to system
    }

    // Create rooms
    system.rooms = createRooms(system)

    console.log(`[v0] Initialized system with ${system.numJudges} judges and ${system.totalProjects} projects`)
    console.log("[v0] Room configuration:")
    for (const room of system.rooms) {
        console.log(`  Room ${room.roomId}: tables ${room.projects.join(", ")}`)
    }

    let attempt = 1
    let success = false
    let finalAssignments = null
    let finalIssues = []

    while (attempt <= maxAttempts && !success) {
        console.log(`\n[v0] Attempt ${attempt} of ${maxAttempts}`)

        const generator = new AssignmentGenerator(system)
        const assignments = generator.generateAssignments()

        const verifier = new AssignmentVerifier(system, assignments)
        const result = verifier.verifyAll()

        success = result.success

        if (success) {
            console.log("[v0] All verifications passed successfully!")
            finalAssignments = result.assignments
        } else {
            console.log("\n[v0] Warning: Issues found in assignments:")
            for (const issue of result.issues) {
                console.log(`  - ${issue}`)
            }
            finalIssues = result.issues

            if (attempt < maxAttempts) {
                console.log("\n[v0] Retrying assignment generation...")
            }
        }

        attempt++
    }

    if (!success) {
        console.log("\n[v0] Failed to generate valid assignments after maximum attempts")
        return { success: false, assignments: [], issues: finalIssues }
    }

    const output = []
    for (let i = 0; i < finalAssignments.length; i++) {
        const judge = system.judges[i]

        // Filter out -1 (empty slots) and only return table numbers
        const tableNumbers = finalAssignments[i].filter((tableNum) => tableNum !== -1)

        output.push({
            name: judge.name,
            assignments: tableNumbers,
        })
    }

    return {
        success: true,
        assignments: output,
        issues: [],
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

function createRooms(system) {
    const rooms = []

    // Sort projects by table number to ensure proper ordering
    const sortedProjects = [...system.projects].sort((a, b) => a.tableNumber - b.tableNumber)

    if (system.roomCapacities && system.roomCapacities.length === system.numRooms) {
        // Use specified room capacities
        let projectIndex = 0

        for (let i = 0; i < system.numRooms; i++) {
            const capacity = system.roomCapacities[i]
            const projectRange = []

            for (let j = 0; j < capacity && projectIndex < sortedProjects.length; j++) {
                projectRange.push(sortedProjects[projectIndex].tableNumber)
                projectIndex++
            }

            rooms.push({
                roomId: i + 1,
                projects: projectRange,
                capacity: projectRange.length,
            })
        }
    } else {
        // Divide projects evenly across rooms
        const projectsPerRoom = Math.ceil(system.totalProjects / system.numRooms)

        for (let i = 0; i < system.numRooms; i++) {
            const startIdx = i * projectsPerRoom
            const endIdx = Math.min((i + 1) * projectsPerRoom, sortedProjects.length)
            const projectRange = []

            for (let j = startIdx; j < endIdx; j++) {
                projectRange.push(sortedProjects[j].tableNumber)
            }

            rooms.push({
                roomId: i + 1,
                projects: projectRange,
                capacity: projectRange.length,
            })
        }
    }

    return rooms
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[array[i], array[j]] = [array[j], array[i]]
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

        for (const project of system.projects) {
            this.projectCounts[project.tableNumber] = 0
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
        shuffleArray(this.initialRoomAssignments)

        this.maxPerJudge = this.basePerJudge + (this.extraAssignments > 0 ? 1 : 0)
        this.teamsPerPhase = Math.ceil(this.maxPerJudge / system.numRooms)
    }

    generateAssignments() {
        this._createBalancedAssignments()
        return this.assignments
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
}

// ============================================================================
// Assignment Verifier
// ============================================================================

class AssignmentVerifier {
    constructor(system, assignments) {
        this.system = system
        this.assignments = assignments
    }

    _verifyJudgingCount() {
        const projectCounts = {}

        for (const project of this.system.projects) {
            projectCounts[project.tableNumber] = 0
        }

        for (const judgeAssignments of this.assignments) {
            for (const tableNum of judgeAssignments) {
                if (tableNum !== -1) {
                    projectCounts[tableNum] = (projectCounts[tableNum] || 0) + 1
                }
            }
        }

        const issues = []
        const underJudgedProjects = []
        const overJudgedProjects = []

        for (const project of this.system.projects) {
            const tableNum = project.tableNumber
            const count = projectCounts[tableNum] || 0
            if (count !== this.system.judgingsPerProject) {
                if (count < this.system.judgingsPerProject) {
                    issues.push(
                        `Table ${tableNum} (${project.name}) is judged ${count} times (should be ${this.system.judgingsPerProject})`,
                    )
                    underJudgedProjects.push({
                        projectId: tableNum,
                        current: count,
                        needed: this.system.judgingsPerProject - count,
                    })
                } else {
                    issues.push(
                        `Table ${tableNum} (${project.name}) is over-judged: ${count} times (should be ${this.system.judgingsPerProject})`,
                    )
                    overJudgedProjects.push({
                        projectId: tableNum,
                        current: count,
                        excess: count - this.system.judgingsPerProject,
                    })
                }
            }
        }

        return { issues, underJudgedProjects, overJudgedProjects }
    }

    _fixUnderJudgedProjects(underJudgedProjects) {
        console.log("\n[v0] Attempting to fix under-judged projects...")

        for (const { projectId, needed } of underJudgedProjects) {
            console.log(`[v0] Fixing Table ${projectId} (needs ${needed} more judgement(s))`)

            let addedCount = 0

            for (let judgeId = 0; judgeId < this.assignments.length && addedCount < needed; judgeId++) {
                const judgeAssignments = this.assignments[judgeId]

                if (judgeAssignments.includes(projectId)) continue

                for (let slotIdx = 0; slotIdx < judgeAssignments.length && addedCount < needed; slotIdx++) {
                    const currentAssignment = judgeAssignments[slotIdx]

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
                            judgeAssignments.push(projectId)
                        }
                        addedCount++
                        console.log(`  ✓ Assigned Table ${projectId} to Judge ${judgeId + 1} at Slot ${slotIdx + 1}`)
                        break
                    }
                }

                if (addedCount < needed && !judgeAssignments.includes(projectId)) {
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
                        console.log(`  ✓ Added Table ${projectId} to Judge ${judgeId + 1} as extra slot`)
                    }
                }
            }

            if (addedCount < needed) {
                console.log(`  ⚠ Could only add ${addedCount}/${needed} missing judgement(s) for Table ${projectId}`)
            }
        }
    }

    _verifySimultaneousJudging() {
        const issues = []
        const maxSlots = Math.max(...this.assignments.map((a) => a.length))

        for (let slotIdx = 0; slotIdx < maxSlots; slotIdx++) {
            const tableNumbers = []

            for (const judgeAssignments of this.assignments) {
                if (slotIdx < judgeAssignments.length && judgeAssignments[slotIdx] !== -1) {
                    tableNumbers.push(judgeAssignments[slotIdx])
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
                    `In Slot ${slotIdx + 1}, tables ${Array.from(duplicates).join(", ")} are being judged simultaneously by multiple judges`,
                )
            }
        }

        return issues
    }

    _verifyNoJudgesStartAtSameTable() {
        const issues = []
        const firstSlotTables = new Map()

        for (let i = 0; i < this.assignments.length; i++) {
            const firstSlot = this.assignments[i][0]
            if (firstSlot && firstSlot !== -1) {
                const judge = this.system.judges[i]
                const judgeName = judge.name

                if (firstSlotTables.has(firstSlot)) {
                    firstSlotTables.get(firstSlot).push(judgeName)
                } else {
                    firstSlotTables.set(firstSlot, [judgeName])
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

        for (let i = 0; i < this.assignments.length; i++) {
            const count = this.assignments[i].filter((t) => t !== -1).length
            const judge = this.system.judges[i]
            const judgeName = judge.name
            judgeCounts[judgeName] = count
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

        if (judgingResult.overJudgedProjects.length > 0) {
            issues.push(...judgingResult.issues)
            return {
                success: false,
                issues,
                assignments: this.assignments,
            }
        }

        issues.push(...judgingResult.issues)
        issues.push(...this._verifySimultaneousJudging())
        issues.push(...this._verifyNoJudgesStartAtSameTable())
        issues.push(...this._verifyJudgeWorkload())

        if (judgingResult.underJudgedProjects.length > 0) {
            this._fixUnderJudgedProjects(judgingResult.underJudgedProjects)

            const recheck = this._verifyJudgingCount()

            if (recheck.underJudgedProjects.length === 0 && recheck.overJudgedProjects.length === 0) {
                console.log("[v0] ✓ Successfully fixed all under-judged projects!")
                return { success: true, issues: [], assignments: this.assignments }
            } else {
                const remainingIssues = []
                remainingIssues.push(...recheck.issues)
                return {
                    success: false,
                    issues: remainingIssues,
                    assignments: this.assignments,
                }
            }
        }

        return {
            success: issues.length === 0,
            issues,
            assignments: this.assignments,
        }
    }
}
