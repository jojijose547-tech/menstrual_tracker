const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');
const app = express();
const multer = require('multer');
const fs = require('fs');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Create uploads folder
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'profile-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ================= NEW: GET ALL CYCLES FOR USER =================
app.get('/api/cycles/user/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = 'SELECT * FROM cycle_data WHERE UserID = ? ORDER BY Start_Date DESC';
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Database error" });
        }
        res.json(results);
    });
});

// ================= CREATE CYCLE ENTRY =================
app.post('/api/cycle', (req, res) => {
    const { userId, startDate, endDate, flow, mood, notes } = req.body;

    if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
    }

    const sql = `
        INSERT INTO cycle_data (UserID, Start_Date, End_Date, Flow_Level, Mood, Notes)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [userId, startDate, endDate || null, flow, mood, notes], (err, result) => {
        if (err) {
            console.error("Error inserting cycle data:", err);
            return res.status(500).json({ message: "Failed to save data" });
        }
        res.status(200).json({ message: "Data saved successfully! ✅", cycleId: result.insertId });
    });
});

// ================= NEW: UPDATE CYCLE ENTRY =================
app.put('/api/cycle/:cycleId', (req, res) => {
    const cycleId = req.params.cycleId;
    const { startDate, endDate, flow, mood, notes } = req.body;

    const sql = `
        UPDATE cycle_data 
        SET Start_Date = ?, End_Date = ?, Flow_Level = ?, Mood = ?, Notes = ?
        WHERE CycleID = ?
    `;

    db.query(sql, [startDate, endDate || null, flow, mood, notes, cycleId], (err, result) => {
        if (err) {
            console.error("Error updating cycle:", err);
            return res.status(500).json({ message: "Failed to update" });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Cycle not found" });
        }
        res.json({ message: "Cycle updated successfully! ✅" });
    });
});

// ================= NEW: DELETE CYCLE ENTRY =================
app.delete('/api/cycle/:cycleId', (req, res) => {
    const cycleId = req.params.cycleId;
    const sql = 'DELETE FROM cycle_data WHERE CycleID = ?';
    
    db.query(sql, [cycleId], (err, result) => {
        if (err) {
            console.error("Error deleting cycle:", err);
            return res.status(500).json({ message: "Failed to delete" });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Cycle not found" });
        }
        res.json({ message: "Cycle deleted successfully! ✅" });
    });
});

// ================= PREDICTION =================
app.post('/api/predict', (req, res) => {
    const { userId, lastPeriodDate, cycleLength } = req.body;

    let last = new Date(lastPeriodDate);
    let nextPeriod = new Date(last);
    nextPeriod.setDate(last.getDate() + parseInt(cycleLength));
    let ovulation = new Date(nextPeriod);
    ovulation.setDate(nextPeriod.getDate() - 14);
    let fertileStart = new Date(ovulation);
    fertileStart.setDate(ovulation.getDate() - 5);
    let fertileEnd = new Date(ovulation);
    fertileEnd.setDate(ovulation.getDate() + 1);

    const sql = `
        INSERT INTO prediction (UserID, Next_Period_Date, Ovulation_Date, Fertile_Window_Start, Fertile_Window_End)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [userId, nextPeriod, ovulation, fertileStart, fertileEnd], (err) => {
        if (err) console.error("Prediction save error:", err);
    });

    res.json({
        nextPeriod: nextPeriod.toDateString(),
        ovulation: ovulation.toDateString()
    });
});

// ================= REMINDER =================
app.post('/api/reminder', (req, res) => {
    const { userId, type, date } = req.body;
    const sql = `INSERT INTO reminders (UserID, Reminder_Type, Reminder_Date, Status) VALUES (?, ?, ?, 'Pending')`;
    
    db.query(sql, [userId, type, date], (err) => {
        if (err) return res.status(500).json({ message: "DB error" });
        res.json({ message: "Reminder set 🔔" });
    });
});

// ================= REPORT =================
app.get('/api/report/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = `SELECT AVG(DATEDIFF(End_Date, Start_Date)) AS avgCycle FROM cycle_data WHERE UserID = ?`;
    
    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json({ message: "DB error" });
        const avg = result[0].avgCycle || 0;
        res.json({
            averageCycleLength: Math.round(avg),
            status: avg > 30 ? "Irregular" : "Normal"
        });
    });
});

// ================= SETTINGS =================
app.post('/api/settings', upload.single('profilePic'), (req, res) => {
    const { userId, name, details } = req.body;
    let profilePicPath = req.file ? '/uploads/' + req.file.filename : null;

    const checkSql = 'SELECT * FROM user_settings WHERE UserID = ?';
    db.query(checkSql, [userId], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error." });

        if (results.length > 0) {
            let updateSql = `UPDATE user_settings SET Name = ?, Overall_Details = ?`;
            let values = [name, details];
            if (profilePicPath) {
                updateSql += `, Profile_Pic = ?`;
                values.push(profilePicPath);
            }
            updateSql += ` WHERE UserID = ?`;
            values.push(userId);
            db.query(updateSql, values, (err) => {
                if (err) return res.status(500).json({ message: "Failed to update profile." });
                res.json({ message: "Profile updated successfully! ✅" });
            });
        } else {
            const insertSql = `INSERT INTO user_settings (UserID, Name, Profile_Pic, Overall_Details) VALUES (?, ?, ?, ?)`;
            db.query(insertSql, [userId, name, profilePicPath, details], (err) => {
                if (err) return res.status(500).json({ message: "Failed to save profile." });
                res.json({ message: "Profile saved successfully! ✅" });
            });
        }
    });
});

// ================= GET PROFILE =================
app.get('/api/settings/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = "SELECT * FROM user_settings WHERE UserID = ?";
    
    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json({ message: "Database error." });
        res.json(result[0] || {});
    });
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
        const isMatch = await bcrypt.compare(password, user.Password_Hash);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid password ❌" });
        }
        res.json({ message: "Login successful ✅", userId: user.UserID });
    });
});

// ================= SERVE PAGES =================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// ================= START SERVER =================
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});