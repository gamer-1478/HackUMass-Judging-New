const { ensureAuthenticated } = require('../middleware/auth');
const teamSchema = require('../schemas/teamSchema');
const userSchema = require('../schemas/userSchema');
const projectSchema = require('../schemas/projectSchema');
const { roomNumberToName } = require('../utils/helper');

const router = require('express').Router();

router.get("/dashboard", ensureAuthenticated, async (req, res) => {
    userSchema.findOne({ email: req.user.Judge_Email }).then(async (user) => {
        if (!user) {
            userSchema.create({
                email: req.user.Judge_Email,
                name: req.user.Judge,
                currentProject: 1,
                assignedProjects: [],
                tutorialCompleted: false,
                tutorialCurrentProject: 1
            }).then(() => {
                res.redirect("/dashboard")
            })
            console.log("New user created");
        }
        else {
            var ListOfAssignments = user.assignedProjects;
            if (!ListOfAssignments || ListOfAssignments.length === 0 || user.currentProject > ListOfAssignments.length) {
                res.render("thankyou.ejs", {
                    currentPage: "dashboard", "navbar": true});
            } else {
                var currentAssignment = ListOfAssignments[user.currentProject - 1];
                console.log("Current Assignment:", currentAssignment);
                var currentTeam = await teamSchema.findOne({ TableNumber: Number(currentAssignment) });
                console.log("Current Team:", currentTeam);
                const totalProjects = ListOfAssignments.length;

                res.render("judge.ejs", {
                    "currentProject": currentTeam.ProjectName,
                    "currentTable": currentTeam.TableNumber,
                    "currentProjectCategory": currentTeam.Category,
                    "currentSlot": "Slot " + user.currentProject,
                    "totalProjects": totalProjects,
                    "roomNumber": roomNumberToName(currentTeam.RoomNumber),
                    "currentPage": "dashboard",
                    "navbar": true
                })
            }
        }
    })
})

router.get("/tutorial", ensureAuthenticated, async (req, res) => {
    const judge = await userSchema.findOne({ email: req.user.Judge_Email });
    const tutorialCurrentProject = judge.tutorialCurrentProject;
    console.log("Tutorial Current Project:", judge);
    if (tutorialCurrentProject > 3) {
        return res.render("thankyoututorial.ejs", { currentPage: "tutorial", navbar: true });
    }
    res.render("tutorial.ejs", {
        currentPage: "tutorial",
        tutorialCurrentProject: tutorialCurrentProject,
        roomNumber: "Tutorial Room",
        currentProject: "Tutorial Project " + tutorialCurrentProject,
        currentProjectCategory: "Tutorial Category",
        totalProjects: 3, 
        currentPage: "tutorial",
        navbar: true
    });
});

router.post("/tutorial", ensureAuthenticated, async (req, res) => {
    var { score1, score2, score3, score4, score5, score6, comments } = req.body;
    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });
    CurrentJudge.tutorialScores.push({
        projectNumber: CurrentJudge.tutorialCurrentProject,
        score1,
        score2,
        score3,
        score4,
        score5,
        score6,
        comments
    });
    CurrentJudge.tutorialCurrentProject = CurrentJudge.tutorialCurrentProject + 1;
    CurrentJudge.save().then(() => {
        res.redirect("/tutorial");
    });
});

router.post("/dashboard", ensureAuthenticated, async (req, res) => {
    var { score1, score2, score3, score4, score5, score6, comments, tableNumber } = req.body;

    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });
    var CurrentTeam = await teamSchema.findOne({ TableNumber: tableNumber });

    projectSchema.create({
        ProjectName: CurrentTeam.ProjectName,
        Category: CurrentTeam.Category,
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
            return slot !== tableNumber;
        });
        CurrentJudge.save().then(() => {
            res.redirect("/dashboard");
        });
    })
})

router.post("/skip", ensureAuthenticated, async (req, res) => {
    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });
    var ListOfAssignments = CurrentJudge.assignedProjects;
    var currentSlot = ListOfAssignments[CurrentJudge.currentProject - 1];
    CurrentJudge.currentProject = CurrentJudge.currentProject + 1;
    CurrentJudge.skippedProjects = [...CurrentJudge.skippedProjects, currentSlot];
    CurrentJudge.save().then(() => {
        res.redirect("/dashboard");
    })
})

router.get("/skipped", ensureAuthenticated, async (req, res) => {
    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });

    var skippedProjectsDetails = await Promise.all(CurrentJudge.skippedProjects.map(async slot => {

        var CurrentTeam = await teamSchema.findOne({ TableNumber: slot })

        return {
            name: CurrentTeam.ProjectName,
            tableNumber: CurrentTeam.TableNumber,
            roomNumber: roomNumberToName(CurrentTeam.RoomNumber),
            category: CurrentTeam.Category
        };
    }));

    res.render("skip.ejs", {
        skippedProjects: skippedProjectsDetails,
        currentPage: "skipped",
        navbar: true
    });
})

router.get("/assignment-sheet", ensureAuthenticated, async (req, res) => {
    var CurrentJudge = await userSchema.findOne({ email: req.user.Judge_Email });
    var assignmentsDetails = [];

    //instead of looping to the current project, loop through all assignments
    for (let i = 1; i <= CurrentJudge.assignedProjects.length; i++) {
        let currentSlot = CurrentJudge.assignedProjects[i];
        if (currentSlot) {
            var CurrentTeam = await teamSchema.findOne({ TableNumber: currentSlot });

            assignmentsDetails.push({
                name: CurrentTeam.ProjectName,
                tableNumber: CurrentTeam.TableNumber,
                roomNumber: roomNumberToName(CurrentTeam.RoomNumber),
                category: CurrentTeam.Category,
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

router.get("/rejudge/:tableNumber", ensureAuthenticated, async (req, res) => {
    //render judge.ejs with the project matching the table number
    var tableNumber = req.params.tableNumber;
    var currentTeam = await teamSchema.findOne({ TableNumber: tableNumber });
    res.render("judge.ejs", {
        "currentProject": currentTeam.ProjectName,
        "currentTable": currentTeam.TableNumber,
        "currentProjectCategory": currentTeam.Category,
        "currentSlot": "Rejudge",
        "totalProjects": null,
        "roomNumber": roomNumberToName(currentTeam.RoomNumber),
        "currentPage": "dashboard",
        "navbar": true,
        "rejudge": true
    })
})

router.get("/404", (req, res) => {
    res.render("404.ejs", { currentPage: "404" })
})

router.get("/thankyou", (req, res) => {
    res.render("thankyou.ejs", { currentPage: "thankyou" })
})

module.exports = router;