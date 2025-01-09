

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

    // Insert login details into the student_logins table if the role is 'student'
    if (role === 'student') {
      const login_time = new Date();
      const formattedLoginTime = login_time.toISOString().slice(0, 19).replace('T', ' '); // Format to 'YYYY-MM-DD HH:MM:SS'

      // Insert the login info into student_logins table
      const insertQuery = 'INSERT INTO student_logins (cet_number, login_time) VALUES (?, ?)';
      await pool.query(insertQuery, [cet_number, formattedLoginTime]);
      console.log('Login info inserted into student_logins table');
    }

    // Send the login success response
    res.status(200).send({ message: 'Login successful', user });
  } catch (error) {
    console.error('Error during login:', error.message);
    res.status(500).send({ error: 'Server error. Please try again later.' });
  }
});

// Endpoint to fetch student login data
app.get('/api/student-logins', async (req, res) => {
  try {
      const query = `
          SELECT student_logins.cet_number, student_logins.login_time, students.name 
          FROM student_logins
          INNER JOIN students ON student_logins.cet_number = students.cet_number
          ORDER BY student_logins.login_time DESC;
      `;
      
      console.log('Executing query: ', query); // Log the query for debugging
      const [rows] = await pool.query(query);

      if (!rows || rows.length === 0) {
          return res.status(404).send({ message: 'No student login data found' });
      }

      console.log('Query Result: ', rows); // Log the rows for debugging
      res.json(rows);
  } catch (err) {
      console.error('Error fetching student login data:', err.message);
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
        console.log('result:',results);
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
              b.college_name,
              b.branch_name,
              b.total_seats,
              b.available_seats,
              (SELECT COUNT(*) 
               FROM student_choices sc
               WHERE sc.college_name = b.college_name
               AND sc.branch_name = b.branch_name
              ) AS applied_count,
              (b.total_seats - (SELECT COUNT(*) 
                                FROM student_choices sc
                                WHERE sc.college_name = b.college_name
                                AND sc.branch_name = b.branch_name
              )) AS seats_available
          FROM branches b
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
  console.log('Request received:', req.body);

  if (!cet_number || !choices || choices.length === 0) {
      return res.status(400).send({ error: 'CET number and choices are required.' });
  }

  try {
      // Step 1: Validate CET number and fetch student_id
      const [students] = await pool.query('SELECT * FROM students WHERE cet_number = ?', [cet_number]);
      if (students.length === 0) {
          console.error(`Invalid CET number: ${cet_number}`);
          return res.status(400).send({ error: 'Invalid CET number' });
      }

      const student_id = students[0].student_id; // Get student_id from the fetched student record
      console.log(`Valid CET number. Student ID: ${student_id}`);

      // Step 2: Check if choices are already submitted for the CET number
      const [existingChoices] = await pool.query('SELECT * FROM student_choices WHERE cet_number = ?', [cet_number]);
      if (existingChoices.length > 0) {
          console.error(`Choices already submitted for CET number: ${cet_number}`);
          return res.status(400).send({ error: 'Choices already submitted for this CET number' });
      }

      // Step 3: Insert choices into the database with student_id
      const insertChoices = choices.map((choice, index) => [
          student_id,              // Use the student_id from the fetched student record
          cet_number,
          choice.college_name,
          choice.branch_name,
          index + 1 // Priority is based on array index (1-based)
      ]);

      const connection = await pool.getConnection(); // Get a transactional connection
      await connection.beginTransaction(); // Start a transaction

      try {
          for (const choice of insertChoices) {
              const [existing] = await connection.query(
                  'SELECT * FROM student_choices WHERE student_id = ? AND college_name = ? AND branch_name = ? AND priority = ?',
                  [choice[0], choice[2], choice[3], choice[4]]
              );

              if (existing.length === 0) {
                  // Insert only if the entry does not already exist
                  await connection.query(
                      'INSERT INTO student_choices (student_id, cet_number, college_name, branch_name, priority) VALUES (?, ?, ?, ?, ?)',
                      choice
                  );
                  console.log(`Inserted choice: ${JSON.stringify(choice)}`);
              } else {
                  console.log(`Duplicate choice detected, skipping: ${JSON.stringify(choice)}`);
              }
          }

          // Step 4: Update the choice_submitted status for the student
          await connection.query(
              'UPDATE students SET choice_submitted = 1 WHERE student_id = ?',
              [student_id]
          );
          console.log('Choice submitted status updated.');

          await connection.commit(); // Commit the transaction
          console.log('All choices inserted and status updated successfully.');
          res.send({ message: 'Choices submitted successfully!' });
      } catch (err) {
          await connection.rollback(); // Rollback on error
          console.error('Error during insertion, rolling back:', err);
          throw err;
      } finally {
          connection.release(); // Release the connection
      }
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
app.get('/api/admins', async (req, res) => {
    try {
        const query = 'SELECT * FROM admins'; // Replace with your table name
        const [results] = await pool.query(query);
        res.json(results);
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).json({ error: 'Failed to fetch admin data' });
    }
});

app.post('/allocate-seat', async (req, res) => {
  // Extract allocation data from the client request body
  const allocationData = req.body;

  // Log the received allocation data for debugging
  console.log('Received allocation data:', allocationData);

  // Validate if all required fields are present
  if (!allocationData.student_id || !allocationData.student_name || !allocationData.college_name || !allocationData.branch_name) {
    return res.status(400).json({ status: 'error', message: 'Missing required fields in allocation data' });
  }

  const connection = await pool.getConnection();

  try {
    // Start transaction
    await connection.beginTransaction();

    // Insert into final_allocate table
    const insertQuery = `INSERT INTO final_allocate (student_id, student_name, college_name, branch_name, allocation_date)
                         VALUES (?, ?, ?, ?, NOW())`;

    await connection.execute(insertQuery, [
      allocationData.student_id,
      allocationData.student_name,
      allocationData.college_name,
      allocationData.branch_name
    ]);

    // Update the branches table by deducting available seats
    const updateQuery = `UPDATE branches SET available_seats = available_seats - 1 WHERE college_name = ? AND branch_name = ? AND available_seats > 0`;
    const [updateResult] = await connection.execute(updateQuery, [
      allocationData.college_name,
      allocationData.branch_name
    ]);

    if (updateResult.affectedRows === 0) {
      throw new Error(`No available seats for ${allocationData.college_name} - ${allocationData.branch_name}`);
    }

    // Commit transaction
    await connection.commit();
    res.json({ status: 'success' });
  } catch (err) {
    // If any error occurs, rollback the transaction
    await connection.rollback();
    console.error('Error during seat allocation:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    // Release the connection back to the pool
    connection.release();
  }
});

app.post('/allocate-all-seats', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    // Start transaction
    await connection.beginTransaction();

    // Step 1: Fetch all allocation logs
    const [logs] = await connection.execute(`
      SELECT 
          al.student_id,  -- Prefix student_id with table alias
          s.name AS student_name,  -- Use "name" from the students table instead of "student_name"
          al.college_name, 
          al.branch_name
      FROM allocation_log al
      JOIN students s ON al.student_id = s.student_id  -- Join with students table to get name
    `);

    // Step 2: Insert the fetched logs into final_allocate
    for (let log of logs) {
      const insertQuery = `
        INSERT INTO final_allocate (student_id, student_name, college_name, branch_name, allocation_date)
        VALUES (?, ?, ?, ?, NOW())
      `;
      await connection.execute(insertQuery, [
        log.student_id,
        log.student_name,
        log.college_name,
        log.branch_name
      ]);
    }

    // Step 3: Update the branches table to deduct available seats
    for (let log of logs) {
      const updateQuery = `
        UPDATE branches SET available_seats = available_seats - 1
        WHERE college_name = ? AND branch_name = ? AND available_seats > 0
      `;
      await connection.execute(updateQuery, [
        log.college_name,
        log.branch_name
      ]);
    }

    // Commit transaction
    await connection.commit();
    res.json({ status: 'success', message: 'Seats allocated successfully for all logs.' });

  } catch (err) {
    // If any error occurs, rollback the transaction
    await connection.rollback();
    console.error('Error during seat allocation:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    // Release the connection back to the pool
    connection.release();
  }
});


app.get('/allocation-log', async (req, res) => {
  const connection = await pool.getConnection();

  try {
      // Query to join allocation_log and students table using student_id
      const [results] = await connection.execute(`
          SELECT 
              al.student_id, 
              s.name AS student_name,  -- Select student_name from students table
              al.college_name, 
              al.branch_name, 
              al.allocation_date 
          FROM allocation_log al
          JOIN students s ON al.student_id = s.student_id  -- Join using student_id
          ORDER BY al.allocation_date DESC
      `);

      res.status(200).json(results);
  } catch (err) {
      console.error('Error fetching allocation logs:', err);
      res.status(500).send('Error fetching allocation logs');
  } finally {
      // Release the connection back to the pool
      connection.release();
  }
});


app.get('/allocation-details/:cet_number', async (req, res) => {
  const connection = await pool.getConnection();
  const { cet_number } = req.params;

  try {
    // Query to fetch allocation details using cet_number
    const [results] = await connection.execute(
      `
      SELECT 
          fa.student_id, 
          fa.student_name, 
          fa.college_name, 
          fa.branch_name, 
          fa.allocation_date
      FROM final_allocate fa
      JOIN students s ON fa.student_id = s.student_id
      WHERE s.cet_number = ?
      `,
      [cet_number] // Using cet_number instead of student_id
    );

    if (results.length > 0) {
      res.status(200).json({
        status: 'success',
        message: 'Allocation details retrieved successfully.',
        data: results[0], // Send only the first result since cet_number should be unique
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'No allocation found for the given CET number.',
      });
    }
  } catch (err) {
    console.error('Error fetching allocation details:', err);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching allocation details.',
    });
  } finally {
    // Release the connection back to the pool
    connection.release();
  }
});





// app.get('/allocation-log', async (req, res) => {
//   const connection = await pool.getConnection();

//   try {
//       // Debug log: start the allocation log fetch
//       console.log("Fetching allocation log...");

//       // Query to join final_allocate and students table
//       const [results] = await connection.execute(`
//           SELECT 
//               fa.student_id, 
//               s.name AS student_name, 
//               fa.college_name, 
//               fa.branch_name, 
//               fa.allocation_date 
//           FROM final_allocate fa
//           JOIN students s ON fa.student_id = s.student_id
//           ORDER BY fa.allocation_date DESC
//       `);

//       // Debug log: check the fetched results
//       console.log("Allocation log results:", results);

//       res.status(200).json(results);
//   } catch (err) {
//       console.error('Error fetching allocation logs:', err);
//       res.status(500).send('Error fetching allocation logs');
//   } finally {
//       // Release the connection back to the pool
//       connection.release();
//   }
// });



app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admindashboard.html'));
});

//+=========================================================
app.get('/api/logins', async (req, res) => {
  const query = 'SELECT cetnumber, login_time FROM student_logins ORDER BY login_time DESC';

  try {
    const [rows] = await pool.query(query);  // Using the connection pool to execute the query
    res.json(rows);  // Return the results as JSON
  } catch (err) {
    console.error('Error fetching login details:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Start server
const PORT = 1234;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});  