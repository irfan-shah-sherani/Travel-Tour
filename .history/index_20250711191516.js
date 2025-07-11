const express = require("express");
const path = require("path");
const mysql = require("mysql2");
const QRCode = require("qrcode");
const crypto = require("crypto");
// const puppeteer = require("puppeteer");
const session = require("express-session");
const bodyParser = require("body-parser");
const pdf = require('html-pdf-node');
// app.set("view engine", "ejs");
const fs = require('fs');




require("dotenv").config();


const app = express();

// Middleware
app.use(express.static("public"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("views", path.join(__dirname, "views"));


// MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});


app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: null
  }
}));

function checkAuth(req, res, next) {
  // console.log("Session in checkAuth:", req.session);
  if (req.session && req.session.isLoggedIn) {
    return next();
  } else {
    return res.redirect('/');
  }
}

const USER = process.env.ADMIN_USER;
const PASS = process.env.ADMIN_PASS;


db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to the database");
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USER && password === PASS) {
    req.session.isLoggedIn = true;
    res.redirect('/Dashboard');
  } else {
res.redirect('/?error=1');

  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});


app.get("/Dashboard",checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Dashboard.html"));
});

// GET: All Records
app.get("/records", (req, res) => {
  db.query("SELECT * FROM TravalRecord", (err, results) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});


// POST: Insert a new record and generate QR code
app.post("/submit", (req, res) => {
  const {
    room_name,
    facility_name,
    facility_number,
    request_number,
    request_type,
    applicant_name,
    creation_date,
    request_amount,
    expiry_date,
    record_number,
    request_status,
    reference_number,
    passport_number,
  } = req.body;

  const qrToken = crypto.randomBytes(16).toString("hex");
  const qrUrl = `http://localhost:3000/form?token=${qrToken}`;

  QRCode.toDataURL(qrUrl, (err, qrBase64) => {
    if (err) {
      console.error("QR Generation Failed:", err);
      return res.status(500).json({ error: "QR Code generation failed" });
    }

    const insertQuery = `
      INSERT INTO TravalRecord (
        room_name, facility_name, facility_number,
        request_number, request_type, applicant_name,
        creation_date, request_amount, expiry_date,
        record_number, request_status, reference_number,
        passport_number, qrcode_url, qr_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertValues = [
      room_name,
      facility_name,
      facility_number,
      request_number,
      request_type,
      applicant_name,
      creation_date,
      request_amount,
      expiry_date,
      record_number,
      request_status,
      reference_number,
      passport_number,
      qrBase64,
      qrToken,
    ];

    db.query(insertQuery, insertValues, (err, result) => {
      if (err) {
        console.error("Insert Failed:", err);
        return res.status(500).json({ error: "Insert failed" });
      }
      res.redirect("/Dashboard");
    });
  });
});

// DELETE: Remove a record
app.post("/delete/:token",checkAuth, (req, res) => {
  const token = req.params.token;
  db.query("DELETE FROM TravalRecord WHERE qr_token = ?", [token], (err, result) => {
    if (err) {
      console.error("Error deleting record:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    res.redirect("/Dashboard");

  });
});

// GET: Record for form display
app.get("/form-record", (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  db.query("SELECT * FROM TravalRecord WHERE qr_token = ?", [token], (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json(results[0]);
  });
});

// Serve the HTML form
// app.get("/form", (req, res) => {
//   res.sendFile(path.join(__dirname, "public", "form.html"));
// });

// // Generate PDF from record
// app.get("/download-pdf", async (req, res) => {
//   const token = req.query.token;
//   if (!token) return res.status(400).json({ error: 'Token is required' });

//   db.query("SELECT * FROM TravalRecord WHERE qr_token = ?", [token], async (err, results) => {
//     if (err || results.length === 0) {
//       return res.status(404).json({ error: "Data not found" });
//     }

//     const record = results[0];

//     try {
//       const browser = await puppeteer.launch({
//         headless: 'new',
//         args: ['--no-sandbox', '--disable-setuid-sandbox'],
//       });

//       const page = await browser.newPage();

//       const baseUrl = process.env.BASE_URL || "http://localhost:3000";
//       // const url = `${baseUrl}/pdf.html?token=${token}`;


//       const url = `http://localhost:3000/pdf.html?token=${token}`;
//       // await page.goto(url, { waitUntil: 'networkidle0' });

//       // await page.evaluate((qrcodeUrl) => {
//       //   const img = document.getElementById("qrcode");
//       //   if (img) {
//       //     img.src = qrcodeUrl;
//       //   }
//       // }, record.qrcode_url);

//       // await page.waitForSelector("#qrcode[src]", { timeout: 15000 });


// await page.goto(url, { waitUntil: 'load', timeout: 30000 });

// // Wait for layout to load
// await page.waitForSelector("#qrcode", { timeout: 15000 });

// // Inject QR code directly into image
// await page.evaluate((qrcodeUrl) => {
//   const img = document.getElementById("qrcode");
//   if (img) img.src = qrcodeUrl;
// }, record.qrcode_url);

// // Wait for src to be applied
// await page.waitForSelector("#qrcode[src]", { timeout: 15000 });



//       const pdfBuffer = await page.pdf({
//         format: "A4",
//         printBackground: true,
//         scale: 0.8
//       });

//       await browser.close();

//       res.set({
//         "Content-Type": "application/pdf",
//         "Content-Disposition": `attachment; filename="record_${token}.pdf"`
//       });
//       res.send(pdfBuffer);
//     } catch (err) {
//       console.error("PDF generation error:", err);
//       res.status(500).send("Failed to generate PDF");
//     }
//   });
// });


app.get("/download-pdf", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token is required" });

  db.query(
    "SELECT * FROM TravalRecord WHERE qr_token = ?",
    [token],
    async (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).json({ error: "Data not found" });
      }

      const record = results[0];

      try {
        // 1. Render the EJS view as HTML string
        const htmlContent = await ejs.renderFile(
          path.join(__dirname, "views", "pdf.ejs"),
          { record }
        );

        // Optional: Debug output to check HTML
        fs.writeFileSync("debug_output.html", htmlContent);
        console.log("✅ Rendered HTML length:", htmlContent.length);

        // 2. Generate PDF from HTML content
        const file = { content: htmlContent };
        const options = {
          format: "A4",
          printBackground: true,
          margin: { top: "10mm", bottom: "10mm" },
        };

        const pdfBuffer = await pdf.generatePdf(file, options);

        // 3. Send PDF for download
        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="record_${token}.pdf"`,
        });
        res.send(pdfBuffer);
      } catch (error) {
        console.error("❌ PDF generation error:", error);
        res.status(500).send("Failed to generate PDF");
      }
    }
  );
});
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
