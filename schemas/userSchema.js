const { skip } = require('node:test');

const mongoose = require('mongoose'),
    reqString = { type: String, required: true },
    nonreqString = { type: String, required: false },
    reqNumber = { type: Number, required: true },
    reqBoolean = { type: Boolean, required: true, default: false },
    moment = require('moment'),
    now = new Date(),
    dateStringWithTime = moment(now).format('YYYY-MM-DD HH:MM:SS');

const userSchema = new mongoose.Schema({
    email: reqString,
    name: reqString,
    date: {
        type: String,
        default: dateStringWithTime
    },
    currentProject: reqNumber,
    judgedProjects: { type: Array, default: [] },
    skippedProjects: { type: Array, default: [] }
})

module.exports = mongoose.model("User", userSchema)