function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    else res.redirect('/auth/login');
}

function forwardAuthenticated(req, res, next) {
    if (!req.isAuthenticated()) {
        return next();
    }
    else res.redirect('/dashboard');
}


module.exports = { ensureAuthenticated, forwardAuthenticated };