const router = require('express').Router();
const User = require('../schemas/userSchema.js'),
    passport = require('passport'),
    { ensureAuthenticated, forwardAuthenticated } = require('../middleware/auth.js');

//login 

router.get('/login', forwardAuthenticated, (req, res) => {
    res.render('login', { user: req.user, currentPage: 'login', msg: '' });
})

router.post('/login', async (req, res, next) => {
    passport.authenticate('local', { session: true }, (err, user, info) => {
        if (err) throw err;
        if (!user) {
            console.log(info.message)
            res.render("login.ejs", { "msg": `${info.message}` })
        } else {
            req.logIn(user, (err) => {
                if (err) throw err;
                res.redirect('/dashboard');
            });
        }
    })(req, res, next);
})

router.get('/user', (req, res) => {
    res.send(req.user)
})

router.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/')
})

module.exports = router;