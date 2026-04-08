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



// Serve static files (HTML, CSS, JS)

app.use(express.static(path.join(__dirname, 'public')));



// ================= ROUTES =================

// Create an 'uploads' folder inside your 'public' folder if it doesn't exist

const uploadDir = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {

    fs.mkdirSync(uploadDir, { recursive: true });

}



// Set up Multer storage

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(null, uploadDir); // Save files to public/uploads

    },

    filename: function (req, file, cb) {

        // Give the file a unique name using the timestamp

        cb(null, 'profile-' + Date.now() + path.extname(file.originalname));

    }

});

const upload = multer({ storage: storage });







// ================= CYCLE ENTRY =================

app.post('/api/cycle', (req, res) => {

    const { userId, startDate, endDate, flow, mood, notes } = req.body;



    // 1. Make sure userId exists so we don't insert orphaned data

    if (!userId) {

        return res.status(400).json({ message: "User ID is required to save cycle data." });

    }



    // 2. The SQL query matching your cycle_data table schema

    const sql = `

        INSERT INTO cycle_data

        (UserID, Start_Date, End_Date, Flow_Level, Mood, Notes)

        VALUES (?, ?, ?, ?, ?, ?)

    `;



    // 3. Execute the query

    db.query(sql, [userId, startDate, endDate, flow, mood, notes], (err, result) => {

        if (err) {

            console.error("Error inserting cycle data:", err);

            return res.status(500).json({ message: "Failed to save data to the database." });

        }

       

        // 4. Send success back to the frontend

        res.status(200).json({ message: "Data saved successfully! ✅" });

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

        INSERT INTO prediction

        (UserID, Next_Period_Date, Ovulation_Date, Fertile_Window_Start, Fertile_Window_End)

        VALUES (?, ?, ?, ?, ?)

    `;



    db.query(sql, [

        userId,

        nextPeriod,

        ovulation,

        fertileStart,

        fertileEnd

    ]);



    res.json({

        nextPeriod: nextPeriod.toDateString(),

        ovulation: ovulation.toDateString()

    });

});





// ================= REMINDER =================

app.post('/api/reminder', (req, res) => {

    const { userId, type, date } = req.body;



    const sql = `

        INSERT INTO reminders (UserID, Reminder_Type, Reminder_Date, Status)

        VALUES (?, ?, ?, 'Pending')

    `;



    db.query(sql, [userId, type, date], (err) => {

        if (err) return res.status(500).json({ message: "DB error" });



        res.json({ message: "Reminder set 🔔" });

    });

});





// ================= REPORT =================

app.get('/api/report/:userId', (req, res) => {

    const userId = req.params.userId;



    const sql = `

        SELECT

            AVG(DATEDIFF(End_Date, Start_Date)) AS avgCycle

        FROM cycle_data

        WHERE UserID = ?

    `;



    db.query(sql, [userId], (err, result) => {

        if (err) return res.status(500).json({ message: "DB error" });



        const avg = result[0].avgCycle || 0;



        res.json({

            averageCycleLength: Math.round(avg),

            status: avg > 30 ? "Irregular" : "Normal"

        });

    });

});

// 👉 Default route → homepage

app.get('/', (req, res) => {

    res.sendFile(path.join(__dirname, 'public', 'index.html'));

});



// 👉 Serve app dashboard page after login

app.get('/app', (req, res) => {

    res.sendFile(path.join(__dirname, 'public', 'app.html'));

});





// ================= SETTINGS & PROFILE =================

// Note the "upload.single('profilePic')" middleware here!

app.post('/api/settings', upload.single('profilePic'), (req, res) => {

    const { userId, name, details } = req.body;

   

    // If an image was uploaded, create the web path for it. Otherwise, leave it null.

    let profilePicPath = req.file ? '/uploads/' + req.file.filename : null;



    // 1. Check if the user already has a settings row in the database

    const checkSql = 'SELECT * FROM user_settings WHERE UserID = ?';

    db.query(checkSql, [userId], (err, results) => {

        if (err) return res.status(500).json({ message: "Database error." });



        if (results.length > 0) {

            // 2a. UPDATE existing settings

            let updateSql = `UPDATE user_settings SET Name = ?, Overall_Details = ?`;

            let values = [name, details];



            // Only update the profile pic if they uploaded a new one

            if (profilePicPath) {

                updateSql += `, Profile_Pic = ?`;

                values.push(profilePicPath);

            }

            updateSql += ` WHERE UserID = ?`;

            values.push(userId);



            db.query(updateSql, values, (err) => {

                if (err) {

                    console.error(err);

                    return res.status(500).json({ message: "Failed to update profile." });

                }

                res.json({ message: "Profile updated successfully! ✅" });

            });

        } else {

            // 2b. INSERT new settings

            const insertSql = `INSERT INTO user_settings (UserID, Name, Profile_Pic, Overall_Details) VALUES (?, ?, ?, ?)`;

            db.query(insertSql, [userId, name, profilePicPath, details], (err) => {

                if (err) {

                    console.error(err);

                    return res.status(500).json({ message: "Failed to save profile." });

                }

                res.json({ message: "Profile saved successfully! ✅" });

            });

        }

    });

});



// ================= GET USER PROFILE DATA =================

app.get('/api/settings/:userId', (req, res) => {

    const userId = req.params.userId;

    const sql = "SELECT * FROM user_settings WHERE UserID = ?";

   

    db.query(sql, [userId], (err, result) => {

        if (err) {

            console.error(err);

            return res.status(500).json({ message: "Database error." });

        }

       

        if (result.length > 0) {

            res.json(result); // Send back the user's settings

        } else {

            res.json({}); // Send empty object if no settings exist yet

        }

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