const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
};

let pool;
(async function initDB() {
  try {
    pool = await mysql.createPool(dbConfig);
    console.log("MySQL Connected Successfully!");
  } catch (err) {
    console.error("Database connection failed:", err);
  }
})();

app.get("/", (req, res) => {
  res.send("Backend running....");
});



///////////////////////////
// Registration
///////////////////////////
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  if (!name || !email || !password || !phone || !address) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  try {
    const [existing] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const [result] = await pool.query(
      "INSERT INTO users (name, email, password, phone, address) VALUES (?, ?, ?, ?, ?)",
      [name, email, password, phone, address]
    );

    res.json({ success: true, message: "User registered successfully", userId: result.insertId });
  } catch (err) {
    console.error("Registration Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



///////////////////////////
// Login
///////////////////////////
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  try {
    const [users] = await pool.query(
      "SELECT * FROM users WHERE email=? AND password=?",
      [email, password]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const user = users[0];

    // ✅ return userId clearly
    res.json({
      success: true,
      message: "Login successful",
      userId: user.id, 
      name: user.name,
      email: user.email
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ====================
// ADMIN LOGIN
// ====================
app.post("/api/auth/admin-login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password required" });
  }

  try {
    const [admins] = await pool.query("SELECT * FROM admins WHERE email=?", [email]);

    if (admins.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid admin credentials" });
    }

    if (admins[0].password !== password) {
      return res.status(401).json({ success: false, message: "Invalid admin credentials" });
    }

    res.json({
      success: true,
      message: "Admin login successful",
      adminId: admins[0].id,
      email: admins[0].email,
    });
  } catch (err) {
    console.error("Admin Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



///////////////////////////
// Check Email
///////////////////////////
app.post("/api/auth/check-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email is required" });

  try {
    const [users] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (users.length > 0) {
      return res.json({ success: true, message: "Email exists" });
    }
    res.json({ success: false, message: "Email not found" });
  } catch (err) {
    console.error("Check Email Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



///////////////////////////
// Update Password
///////////////////////////
app.post("/api/auth/update-password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  try {
    const [users] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "Email not found" });
    }

    await pool.query("UPDATE users SET password=? WHERE email=?", [newPassword, email]);
    res.json({ success: true, message: "Password updated successfully!" });
  } catch (err) {
    console.error("Update Password Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ====================
// CREATE BOOKING
// ====================
app.post("/api/bookings", async (req, res) => {
  const {
    email,
    category,
    services,
    total_members,
    food_items,
    date,
    time,
    location,
    total
  } = req.body;

  if (!email || !date || !time || !location) {
    return res.status(400).json({
      success: false,
      message: "Email, date, time, and location are required"
    });
  }

  // Convert 12-hour time to 24-hour format
  function convertTo24Hour(timeStr) {
    const [timePart, modifier] = timeStr.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);

    if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  }

  const formattedTime = convertTo24Hour(time);

  try {
    // Get user ID
    const [user] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (user.length === 0) {
      return res.status(400).json({ success: false, message: "User not found" });
    }
    const userId = user[0].id;

    // Check for existing booking at same date & time
    const [existing] = await pool.query(
      "SELECT id FROM bookings WHERE event_date = ? AND event_time = ?",
      [date, formattedTime]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Sorry, the event is already booked. Please contact the admin at 9344016076"
      });
    }

    // Insert booking
    const [result] = await pool.query(
      `INSERT INTO bookings 
      (user_id, category, services, total_members, food_items, event_date, event_time, location, total, booking_status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        category,
        JSON.stringify(services || []),
        total_members || 0,
        JSON.stringify(food_items || []),
        date,
        formattedTime,
        location,
        total || 0,
        "pending",
        "pending"
      ]
    );

    res.json({
      success: true,
      message: "Booking created successfully",
      bookingId: result.insertId
    });

  } catch (err) {
    console.error("Booking Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ====================
// GET USER PROFILE (by email)
// ====================
app.get("/api/profile/:email", async (req, res) => {
  const email = req.params.email;
  try {
    const [users] = await pool.query(
      "SELECT name, email, phone, address FROM users WHERE email=?",
      [email]
    );
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    // Optional: Return only the profile object (no password)
    res.json({ success: true, profile: users });
  } catch (err) {
    console.error("Profile Fetch Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ====================
// UPDATE USER PROFILE
// ====================
app.put("/api/profile/:email", async (req, res) => {
  const email = req.params.email;
  const { name, phone, address } = req.body;
  if (!name || !phone || !address) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }
  try {
    const [result] = await pool.query(
      "UPDATE users SET name=?, phone=?, address=? WHERE email=?",
      [name, phone, address, email]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get('/api/bookings/:email', async (req, res) => {
  const email = req.params.email;
  try {
    // Step 1: Find the user ID using the email
    const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      // User not found for given email
      return res.status(404).json({ message: 'User not found' });
    }
    const userId = users[0].id;

    // Step 2: Use the userId to find relevant bookings
    const [bookings] = await pool.query('SELECT * FROM bookings WHERE user_id = ?', [userId]);

    // Step 3: Return the booking data to the frontend
    res.json({ bookings });
  } catch (error) {
    console.error('Fetch bookings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


app.get("/api/bookings/:email", (req, res) => {
  const email = req.params.email;

  const sql = `
    SELECT b.category, b.services, b.date
    FROM bookings b
    INNER JOIN users u ON u.id = b.user_id
    WHERE u.email = ?
    ORDER BY b.date DESC
  `;

  db.query(sql, [email], (err, result) => {
    if (err) {
      console.error("Query error:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (result.length === 0) {
      return res.status(200).json({ bookings: [] });
    }

    const formatted = result.map(row => {
      let servicesList = [];
      try {
        // If stored as JSON array
        servicesList = JSON.parse(row.services);
      } catch {
        // If stored as normal string
        servicesList = row.services ? [row.services] : [];
      }

      return {
        category: row.category,
        services: servicesList,
        date: row.date
      };
    });

    res.status(200).json({ bookings: formatted });
  });
});

app.post("/api/reviews", async (req, res) => {
  const { name, email, rating, review } = req.body;

  // Validate inputs
  if (!name || !email || !rating || !review) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  try {
    // Insert review directly
    await pool.query(
      "INSERT INTO reviews (name, email, rating, review, date) VALUES (?, ?, ?, ?, NOW())",
      [name, email, rating, review]
    );

    res
      .status(201)
      .json({ success: true, message: "Review submitted successfully" });
  } catch (err) {
    console.error("Review Insert Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to submit review" });
  }
});

///////////////////////////
// ADMIN DASHBOARD STATS
///////////////////////////

// GET dashboard overview
app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const [[overview]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM bookings) as totalBookings,
        (SELECT COUNT(*) FROM bookings WHERE booking_status = 'pending') as pendingBookings,
        (SELECT COUNT(*) FROM bookings WHERE booking_status = 'confirmed') as confirmedBookings,
        (SELECT COUNT(*) FROM bookings WHERE booking_status = 'cancelled') as cancelledBookings,
        (SELECT IFNULL(SUM(total), 0) FROM bookings WHERE payment_status = 'paid') as totalPayments,
        (SELECT IFNULL(SUM(total), 0) FROM bookings WHERE payment_status = 'pending') as pendingPayments
    `);
    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET monthly bookings for last 12 months
app.get('/api/dashboard/monthly-bookings', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DATE_FORMAT(event_date, '%b') as month, COUNT(*) as count
      FROM bookings
      WHERE event_date > DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY YEAR(event_date), MONTH(event_date)
      ORDER BY YEAR(event_date), MONTH(event_date)
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET payments insights (paid vs pending)
app.get('/api/dashboard/payments-insights', async (req, res) => {
  try {
    const [paidRows] = await pool.query(`
      SELECT IFNULL(SUM(total), 0) as amount FROM bookings WHERE payment_status = 'paid'
    `);
    const [pendingRows] = await pool.query(`
      SELECT IFNULL(SUM(total), 0) as amount FROM bookings WHERE payment_status = 'pending'
    `);
    res.json([
      { label: 'Total Paid', amount: paidRows[0].amount },
      { label: 'Pending', amount: pendingRows[0].amount }
    ]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get("/api/admin/profile", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const [results] = await pool.query(
      "SELECT id, name, email, password, role FROM admins WHERE email = ?",
      [email]
    );

    if (results.length === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.json(results[0]);
  } catch (err) {
    console.error("Error fetching admin profile:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// GET all bookings
app.get("/api/bookings", async (req, res) => {
  try {
    const query = `
      SELECT 
        b.id, 
        u.name AS userName, 
        b.user_id, 
        DATE_FORMAT(b.event_date, '%d-%b-%Y') AS photoshootDate,  
        b.booking_status AS status, 
        b.payment_status
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.booking_status = 'pending'
      ORDER BY b.id DESC
    `;
    const [results] = await pool.query(query);
    res.json(results);
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ message: "Error fetching bookings" });
  }
});

// Update booking status
app.post("/api/bookings/update", async (req, res) => {
  const { bookingId, booking_status } = req.body;

  if (!bookingId || !booking_status) {
    return res.status(400).json({ message: "bookingId and booking_status are required" });
  }

  try {
    // Make sure status is valid
    const validStatuses = ['pending','confirmed','cancelled','rejected'];
    if (!validStatuses.includes(booking_status)) {
      return res.status(400).json({ message: "Invalid booking_status value" });
    }

    // Update booking
    const [updateResult] = await pool.query(
      "UPDATE bookings SET booking_status = ? WHERE id = ?",
      [booking_status, bookingId]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Get user_id
    const [rows] = await pool.query("SELECT user_id FROM bookings WHERE id = ?", [bookingId]);
    const userId = rows[0].user_id;

    // Insert notification
    const message = booking_status === "confirmed" 
      ? "Your booking has been confirmed ✅" 
      : "Sorry, your booking has been cancelled ❌";

    await pool.query("INSERT INTO notifications (user_id, message) VALUES (?, ?)", [userId, message]);

    // Return the **updated booking**
    const [updatedBooking] = await pool.query(
      "SELECT * FROM bookings WHERE id = ?",
      [bookingId]
    );

    res.json({ message: "Booking updated & notification saved ✅", booking: updatedBooking[0] });
  } catch (err) {
    console.error("Booking update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// 🟢 Fetch only pending payments with user details
// Fetch only pending payments with user info
app.get("/api/payments/pending", async (req, res) => {
  try {
    const query = `
      SELECT 
        b.id, b.user_id, b.services, b.total, b.payment_status,
        u.name, u.email, u.phone
      FROM bookings b
      INNER JOIN users u ON b.user_id = u.id
      WHERE b.payment_status = 'pending'
      ORDER BY b.id DESC
    `;
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching pending payments:", err);
    res.status(500).json({ message: "Error fetching pending payments" });
  }
});




app.put("/api/payments/markPaid/:id", async (req, res) => {
  const paymentId = req.params.id;
  try {
    const [result] = await pool.query(
      "UPDATE bookings SET payment_status = 'paid' WHERE id = ?",
      [paymentId]
    );

    // Send notification
    const [rows] = await pool.query(
      "SELECT user_id FROM bookings WHERE id = ?",
      [paymentId]
    );
    const userId = rows[0].user_id;

    const message = "Your payment has been successfully received ✅";
    await pool.query(
      "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
      [userId, message]
    );

    res.json({ message: "Payment updated & notification sent ✅" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// API: Get Notifications for User
// Helper: Get current week's Monday
function getStartOfWeek() {
  const now = new Date();
  const day = now.getDay(); // 0=Sunday, 1=Monday ...
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when Sunday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// GET notifications for a user for current week
app.get("/api/notifications/:userId", async (req, res) => {
  const { userId } = req.params;
  const startOfWeek = getStartOfWeek();

  try {
    const query = `
      SELECT id, user_id, message, created_at
      FROM notifications
      WHERE user_id = ? AND created_at >= ?
      ORDER BY created_at DESC
    `;
    const [rows] = await pool.execute(query, [userId, startOfWeek]);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
});



// Assuming you are using `mysql2/promise` and have pool initialized
app.get("/api/adminreviews", async (req, res) => {
  try {
    const query = `
      SELECT id, name, email, rating, review, DATE_FORMAT(date, '%d-%b-%Y') AS date
      FROM reviews
      ORDER BY id DESC
    `;
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching admin reviews:", err);
    res.status(500).json({ message: "Error fetching reviews" });
  }
});

// Delete a review
// Delete a review
app.delete("/api/adminreviews/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM reviews WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Review not found" });
    }
    res.json({ message: "Review deleted successfully" });
  } catch (err) {
    console.error("Error deleting review:", err);
    res.status(500).json({ message: "Error deleting review" });
  }
});


// Get all users with optional search
// GET all users with optional search
app.get("/api/admin/users", async (req, res) => {
  try {
    const { search } = req.query;
    let query = "SELECT id, name, email, password, phone, address, created_at, blocked FROM users";
    const params = [];

    if (search) {
      query += " WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += " ORDER BY id DESC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Error fetching users" });
  }
});


// Update user
app.put("/api/admin/users/update/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, address } = req.body;
  try {
    await pool.query(
      "UPDATE users SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?",
      [name, email, phone, address, id]
    );
    res.json({ message: "User updated successfully" });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ message: "Error updating user" });
  }
});

// Delete user
app.delete("/api/admin/users/delete/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ message: "Error deleting user" });
  }
});

// Block / Unblock user
app.put("/api/admin/users/block/:id", async (req, res) => {
  const { id } = req.params;
  const { blocked } = req.body; // 1 = blocked, 0 = active
  try {
    await pool.query("UPDATE users SET blocked = ? WHERE id = ?", [blocked, id]);
    res.json({ message: blocked == 1 ? "User blocked" : "User unblocked" });
  } catch (err) {
    console.error("Error blocking/unblocking user:", err);
    res.status(500).json({ message: "Error updating user status" });
  }
});





const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

