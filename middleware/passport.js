const passportLocal = require('passport-local'),
    LocalStrategy = (passportLocal.Strategy),
    bcrypt = require('bcrypt'),
    csv = require('csvtojson'),
    path = require('node:path'),
    csvfile = ("./datafiles/judges_auth.csv"),
    User = require('../schemas/userSchema.js');

const CSVpath = path.resolve(csvfile)
console.log(CSVpath)

module.exports = function passportInit(passport) {
    passport.use(
        new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
            //open the csv file in datafiles and see user email & password
            csv()
                .fromFile(CSVpath)
                .then((jsonObj) => {
                    const user = jsonObj.find(user => user.Judge_Email === email);
                    if (!user) {
                        return done(null, false, { message: 'That email is not registered' });
                    }
                    if (user.Judge_Password == password) {
                        return done(null, user);
                    } else {
                        return done(null, false, { message: 'Password incorrect' });
                    }
                })
        })
    );

    passport.serializeUser(function (user, done) {
        done(null, user.Judge_Email);
    });

    passport.deserializeUser(function (email, done) {
        csv()
            .fromFile(CSVpath)
            .then((jsonObj) => {
                const user = jsonObj.find(user => user.Judge_Email === email);
                done(undefined, user);
            })
    });
};