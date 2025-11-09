const { skip } = require('node:test');
const { assign } = require('nodemailer/lib/shared');

const mongoose = require('mongoose'),
    reqString = { type: String, required: true },
    nonreqString = { type: String, required: false },
    reqNumber = { type: Number, required: true },
    nonreqNumber = { type: Number, required: false },
    reqBoolean = { type: Boolean, required: true, default: false },
    moment = require('moment'),
    now = new Date(),
    dateStringWithTime = moment(now).format('YYYY-MM-DD HH:MM:SS');

const tutorialScoresSchema = new mongoose.Schema({
    projectNumber: reqNumber,
    score1: nonreqNumber,
    score2: nonreqNumber,
    score3: nonreqNumber,
    score4: nonreqNumber,
    score5: nonreqNumber,
    score6: nonreqNumber,
    comments: nonreqString
})

const userSchema = new mongoose.Schema({
    email: reqString,
    name: reqString,
    date: {
        type: String,
        default: dateStringWithTime
    },
    currentProject: reqNumber,
    assignedProjects: { type: Array, default: [] },
    judgedProjects: { type: Array, default: [] },
    skippedProjects: { type: Array, default: [] },
    biasValue: nonreqNumber,
    tutorialCurrentProject: { type: Number, default: 1, required: true },
    tutorialScores: { type: [tutorialScoresSchema], default: [] }
})

module.exports = mongoose.model("User", userSchema)