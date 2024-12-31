

import express from 'express';
import cors from 'cors';  // Import CORS middleware
import mysql from 'mysql2/promise';  // Import the mysql2 promise-based client
import bodyParser from 'body-parser';
//new to connect html
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// app.use(cors({
//     origin: 'http://localhost:3000', // Allow only this origin
// }));
app.use(cors()); // Enable all CORS requests
app.use(bodyParser.json()); 
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
// Create MySQL connection pool
const pool = mysql.createPool({
    host: 'localhost',  // Use your MySQL host here
    user: 'root',       // Use your MySQL user here
    password: '4SF22CD036',  // Use your MySQL password here
    database: 'kcet_seats',  // Use your MySQL database name here
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Login endpoint

app.post('/login', async (req, res) => {
    const { cet_number, password, role } = req.body;

    if (!cet_number || !password || !role) {
        return res.status(400).send({ error: 'CET Number, Password, and Role are required' });
    }

    try {
        let query = '';
        let params = [];

        // Select query based on role
        if (role === 'student') {
            query = 'SELECT * FROM students WHERE cet_number = ? AND password = ? LIMIT 1';
            params = [cet_number, password];
        } else if (role === 'admin') {
            query = 'SELECT * FROM admins WHERE admin_id = ? AND password = ? LIMIT 1';
            params = [cet_number, password];
        } else {
            return res.status(400).send({ error: 'Invalid role' });
        }

        console.log('Executing query:', query, 'with params:', params);

        const [rows] = await pool.query(query, params);

        // Check if no rows are returned
        if (rows.length === 0) {
            return res.status(401).send({ error: 'Invalid credentials' });
        }

        const user = rows[0]; // The first matching row
        res.status(200).send({ message: 'Login successful', user });
    } catch (error) {
        console.error('Error during login:', error.message);
        res.status(500).send({ error: 'Server error. Please try again later.' });
    }
});



// Dashboard endpoint to retrieve CET number, rank, and name details
app.post('/profile', async (req, res) => { 
  const { cet_number } = req.body;

  // Check if cet_number is provided
  if (!cet_number) {
    return res.status(400).send({ error: 'CET Number is required' });
  }

  try {
    // Query to fetch student details
    const query = 'SELECT cet_number, rank_number, name FROM students WHERE cet_number = ?';
    const [results] = await pool.query(query, [cet_number]);

    // If student is found, return the details
    if (results.length > 0) {
      return res.status(200).send({
        message: 'Student details retrieved successfully',
        student: results[0], // Ensure it returns the correct data for this cet_number
      });
    }

    // If no student is found, send a 404 response
    res.status(404).send({ message: 'Student not found' });
  } catch (error) {
    console.error('Dashboard Error:', error.message);
    res.status(500).send({ error: 'Failed to fetch student data. Please try again later.' });
  }
});


// API to fetch all branch details
app.get('/api/branches', async (req, res) => {
    try {
        
        const [results] = await pool.query('SELECT * FROM branches');
        res.json(results);
    } catch (err) {
        console.error('Error fetching branch data:', err);
        res.status(500).json({ error: 'Failed to fetch branch data' });
    }
});






// Route to fetch branch data with applied_count
app.get('/api/branches/withCount', async (req, res) => {
    try {
        const [results] = await pool.query(`
            SELECT 
                branches.*, 
                (SELECT COUNT(*) 
                 FROM student_choices 
                 WHERE student_choices.branch_name = branches.branch_name
                ) AS applied_count 
            FROM branches
        `);
        res.json(results);
    } catch (err) {
        console.error('Error fetching branch data with applied count:', err);
        res.status(500).json({ error: 'Failed to fetch branch data with applied count' });
    }
});




// Store student choices in the database
// POST: Submit choices
app.post('/api/submitChoices', async (req, res) => {
    const { cet_number, choices } = req.body;
    console.log(req.body);
    if (!cet_number || !choices || choices.length === 0) {
        return res.status(400).send({ error: 'CET number and choices are required.' });
    }

    try {
        // Step 1: Validate CET number
        const [students] = await pool.query('SELECT * FROM students WHERE cet_number = ?', [cet_number]);
        if (students.length === 0) {
            return res.status(400).send({ error: 'Invalid CET number' });
        }

        // Step 2: Check if choices are already submitted
        const [existingChoices] = await pool.query('SELECT * FROM student_choices WHERE cet_number = ?', [cet_number]);
        if (existingChoices.length > 0) {
            return res.status(400).send({ error: 'Choices already submitted for this CET number' });
        }

        // Step 3: Insert choices into the database
        const insertChoices = choices.map((choice, index) => [
            cet_number,
            choice.college_name,
            choice.branch_name,
            index + 1 // Priority is based on array index (1-based)
        ]);

        await pool.query(
            'INSERT INTO student_choices (cet_number, college_name, branch_name, priority) VALUES ?',
            [insertChoices]
        );

        // Step 4: Send success response
        res.send({ message: 'Choices submitted successfully!' });
    } catch (err) {
        console.error('Error submitting choices:', err);
        res.status(500).send({ error: 'Error submitting choices. Please try again later.' });
    }
});

  
  // GET: Fetch choices for a CET number
// API to fetch choices for a CET number
app.get('/choices/:cetNumber', async (req, res) => {
    const cetNumber = req.params.cetNumber;

    // Validate that the cet_number is provided
    if (!cetNumber) {
        return res.status(400).send({ error: 'CET Number is required' });
    }

    try {
        // Query to fetch student choices based on the CET number
        const query ='SELECT * FROM student_choices WHERE cet_number = ?' ;
        
        // Execute the query with cet_number as a parameter
        const [results] = await pool.query(query, [cetNumber]);

        // If results are found, return them
        if (results.length > 0) {
            return res.status(200).json(results);
        }

        // If no choices are found, send a 404 response
        res.status(404).json({ message: 'No choices found for the given CET number' });
    } catch (err) {
        console.error('Error fetching choices:', err.message);
        res.status(500).json({ error: 'Failed to fetch choices. Please try again later.' });
    }
});

  
  

  
//---------------------------------------------admin---------------------------------
app.get('/api/admin_dashboard',async(req,res) =>{
    
})

// API to trigger seat allocation
app.post('/close-choice-entry', async (req, res) => {
    const connection = await pool.getConnection();
  
    try {
      await connection.beginTransaction();  // Start the transaction
      
      // Query to select students who have submitted their choices and don't have an allocated seat
      const [students] = await connection.query(`
        SELECT student_id, rank_number
        FROM students
        WHERE choice_submitted = 1 AND allocated_seat IS NULL
        ORDER BY rank_number ASC
      `);
  
      // Query to select available seats
      const [seats] = await connection.query(`
        SELECT SEAT_ID
        FROM seats
        WHERE is_allocated = 0
      `);
  
      if (students.length === 0 || seats.length === 0) {
        return res.status(400).json({ message: 'No students or seats available for allocation.' });
      }
  
      let seatIndex = 0;
      let studentIndex = 0;
  
      // Allocate seats to students based on their rank number
      while (seatIndex < seats.length && studentIndex < students.length) {
        const student = students[studentIndex];
        const seat = seats[seatIndex];
  
        // Update the student's allocated seat in the students table
        await connection.query(`
          UPDATE students
          SET allocated_seat = ?
          WHERE student_id = ?
        `, [seat.SEAT_ID, student.student_id]);
  
        // Update the seat to mark it as allocated and allocate it to the student
        await connection.query(`
          UPDATE seats
          SET is_allocated = 1, allocated_to = ?
          WHERE SEAT_ID = ?
        `, [student.student_id, seat.SEAT_ID]);
  
        seatIndex++;
        studentIndex++;
      }
  
      await connection.commit();  // Commit the transaction
  
      return res.status(200).json({ message: 'Seats allocated successfully.' });
  
    } catch (error) {
      await connection.rollback();  // Rollback the transaction in case of error
      console.error(error);
      return res.status(500).json({ message: 'Error allocating seats.', error });
    } finally {
      connection.release();  // Always release the connection
    }
  });
  // Route to process seat allotment
app.post('/admin/process-seat-allotment', async (req, res) => {
    try {
      // Perform the seat allotment logic using a MySQL query
      const query = `
        UPDATE seats
        SET is_allocated = 1, allocated_to = (
          SELECT student_id FROM students WHERE students.allocated_seat = seats.SEAT_ID
        )
        WHERE SEAT_ID IN (SELECT allocated_seat FROM students WHERE allocated_seat IS NOT NULL)
      `;
      
      const [result] = await pool.execute(query);  // Execute the query using the connection pool
      
      return res.status(200).json({
        message: 'Seat allotment processed successfully.',
      });
    } catch (err) {
      console.error('Error processing seat allotment:', err);
      return res.status(500).json({
        message: 'Error processing seat allotment.',
      });
    }
  });
  
  // Route to trigger seat allocation
 // Route to trigger seat allocation and perform the allocation logic
app.post('/admin/trigger-seat-allocation', async (req, res) => {
    const connection = await pool.getConnection();
  
    try {
      await connection.beginTransaction(); // Start the transaction
  
      // Query to select students who have submitted their choices and don't have an allocated seat
      const [students] = await connection.query(`
        SELECT student_id, rank_number
        FROM students
        WHERE choice_submitted = 1 AND allocated_seat IS NULL
        ORDER BY rank_number ASC
      `);
  
      // Query to select available seats
      const [seats] = await connection.query(`
        SELECT SEAT_ID
        FROM seats
        WHERE is_allocated = 0
      `);
  
      if (students.length === 0 || seats.length === 0) {
        return res.status(400).json({ message: 'No students or seats available for allocation.' });
      }
  
      let seatIndex = 0;
      let studentIndex = 0;
  
      // Allocate seats to students based on their rank number
      while (seatIndex < seats.length && studentIndex < students.length) {
        const student = students[studentIndex];
        const seat = seats[seatIndex];
  
        // Update the student's allocated seat in the students table
        await connection.query(`
          UPDATE students
          SET allocated_seat = ?
          WHERE student_id = ?
        `, [seat.SEAT_ID, student.student_id]);
  
        // Update the seat to mark it as allocated and allocate it to the student
        await connection.query(`
          UPDATE seats
          SET is_allocated = 1, allocated_to = ?
          WHERE SEAT_ID = ?
        `, [student.student_id, seat.SEAT_ID]);
  
        seatIndex++;
        studentIndex++;
      }
  
      await connection.commit(); // Commit the transaction
  
      return res.status(200).json({ message: 'Seats allocated successfully.' });
  
    } catch (error) {
      await connection.rollback(); // Rollback the transaction in case of error
      console.error('Error allocating seats:', error);
      return res.status(500).json({ message: 'Error allocating seats.', error });
    } finally {
      connection.release(); // Always release the connection
    }
  });
  
  
  


app.get('/choiceentry/collegeSeatTable', async (req, res) => {
    try {
        const query = 'SELECT * FROM seat_allocation WHERE round = 1'; // Get seat allocation for 1st round
        const [seatAllocations] = await pool.query(query);

        res.render('collegeSeatTable', { seatAllocations });
    } catch (error) {
        console.error('Error fetching seat allocation:', error.message);
        res.status(500).send({ error: 'Failed to load college seat table' });
    }
});



//+=========================================================
//allocate seats
app.post('/allocate-seats', async (req, res) => {
    try {
        // Fetch students sorted by rank_number
        const [students] = await pool.query(`
            SELECT * FROM students ORDER BY rank_number ASC
        `);

        // Fetch available seats
        const [seats] = await pool.query(`
            SELECT * FROM seats WHERE is_allocated = 0
        `);

        if (students.length === 0 || seats.length === 0) {
            return res.status(400).json({ message: "No students or seats available for allocation." });
        }

        // Allocate seats
        let seatIndex = 0;
        for (const student of students) {
            if (seatIndex >= seats.length) break;

            const seat = seats[seatIndex];

            // Update the seat as allocated
            await pool.query(`
                UPDATE seats
                SET is_allocated = 1, allocated_to = ?
                WHERE id = ?
            `, [student.id, seat.id]);

            // Update the student with allocated seat
            await pool.query(`
                UPDATE students
                SET allocated_seat = ?
                WHERE id = ?
            `, [seat.id, student.id]);

            seatIndex++;
        }

        res.status(200).json({ message: "Seats allocated successfully!" });
    } catch (error) {
        console.error("Error allocating seats:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});


// Start server
const PORT = 1234;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});  