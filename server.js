const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// ================= ROUTES =================

// 👉 Default route → homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 👉 Serve app dashboard page after login
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});


// ================= REGISTER =================
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;

    const checkUser = "SELECT * FROM users WHERE Email = ?";
    db.query(checkUser, [email], async (err, result) => {

        if (result.length > 0) {
            return res.status(400).json({ message: "User already exists ❌" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = "INSERT INTO users (Name, Email, Password_Hash) VALUES (?, ?, ?)";
        db.query(sql, [name, email, hashedPassword], (err) => {
            if (err) throw err;
            res.json({ message: "Registered successfully ✅" });
        });
    });
});

// ================= LOGIN =================
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    const sql = "SELECT * FROM users WHERE Email = ?";

    db.query(sql, [email], async (err, result) => {
        if (err) throw err;

        if (result.length === 0) {
            return res.status(400).json({ message: "User not found ❌" });
        }

        const user = result[0];

        // Compare password
        const isMatch = await bcrypt.compare(password, user.Password_Hash);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid password ❌" });
        }

        // ✅ SUCCESS LOGIN
        res.json({
            message: "Login successful ✅",
            userId: user.UserID
        });
    });
});


// ================= SERVER =================
app.listen(3000, () => {
    console.log(" Server running at http://localhost:3000");
});