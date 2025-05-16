const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// File paths
const employeeFilePath = path.join(__dirname, 'employees.json');
const attendanceFilePath = path.join(__dirname, 'attendance.json');

// Load employee list once at startup
let employees = [];
try {
  const employeeData = fs.readFileSync(employeeFilePath, 'utf8');
  employees = JSON.parse(employeeData);
} catch (err) {
  console.error('Failed to read employees.json:', err.message);
  employees = [];
}

// Load or initialize attendance records
let attendanceRecords = {};
try {
  if (fs.existsSync(attendanceFilePath)) {
    const attendanceData = fs.readFileSync(attendanceFilePath, 'utf8');
    attendanceRecords = JSON.parse(attendanceData);
  }
} catch (err) {
  console.error('Failed to load attendance.json:', err.message);
  attendanceRecords = {};
}

// Helper to save attendance to file
async function saveAttendance() {
  try {
    await fsp.writeFile(attendanceFilePath, JSON.stringify(attendanceRecords, null, 2));
  } catch (err) {
    console.error('Failed to save attendance:', err.message);
  }
}

// Helper to save employees to file
async function saveEmployees() {
  try {
    await fsp.writeFile(employeeFilePath, JSON.stringify(employees, null, 2));
  } catch (err) {
    console.error('Failed to save employees:', err.message);
  }
}

// Helper to get today's date string (yyyy-mm-dd)
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// Helper to calculate late/early/half-day status
function getAttendanceStatus(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;

  const startOfficial = new Date(`1970-01-01T10:00:00`);
  const endOfficial = new Date(`1970-01-01T17:00:00`);
  const graceLateCheckIn = new Date(`1970-01-01T10:15:00`);
  const graceEarlyCheckOut = new Date(`1970-01-01T16:45:00`);

  const [inH, inM, inS] = checkIn.split(':').map(Number);
  const [outH, outM, outS] = checkOut.split(':').map(Number);

  const checkInTime = new Date(1970, 0, 1, inH, inM, inS);
  const checkOutTime = new Date(1970, 0, 1, outH, outM, outS);

  let workMs = checkOutTime - checkInTime;
  if (workMs < 0) workMs += 24 * 60 * 60 * 1000;

  const officialWorkMs = endOfficial - startOfficial; // 7 hours
  const halfDayMs = officialWorkMs / 2; // 3.5 hours

  const isLateCheckIn = checkInTime > graceLateCheckIn;
  const isEarlyCheckOut = checkOutTime < graceEarlyCheckOut;
  const isHalfDay = workMs < halfDayMs;

  return {
    isLateCheckIn,
    isEarlyCheckOut,
    isHalfDay,
    workingHours: msToHoursMinutes(workMs),
  };
}

// Convert ms to "Xh Ym"
function msToHoursMinutes(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

// Normalize empId to uppercase for consistent keys
function normalizeId(id) {
  return id.trim().toUpperCase();
}

// ROUTES

// Get all employees
app.get('/employees', (req, res) => {
  res.json(employees);
});

// Get employee by ID
app.get('/employee/:id', (req, res) => {
  const id = normalizeId(req.params.id);
  const emp = employees.find(e => normalizeId(e.id) === id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(emp);
});

// Get all attendance records (NEW)
// This matches frontend fetch to /attendance
app.get('/attendance', (req, res) => {
  res.json(attendanceRecords);
});

// Get attendance for employee on given date with status info
app.get('/attendance/:id/:date', (req, res) => {
  const id = normalizeId(req.params.id);
  const { date } = req.params;
  const empAttendance = attendanceRecords[id];
  if (!empAttendance || !empAttendance[date]) {
    return res.json({ checkIn: null, checkOut: null });
  }
  const { checkIn, checkOut } = empAttendance[date];

  const status = getAttendanceStatus(checkIn, checkOut);

  res.json({
    checkIn,
    checkOut,
    ...status,
  });
});

// Check-In endpoint
app.post('/attendance/checkin', async (req, res) => {
  if (!req.body || !req.body.empId) return res.status(400).json({ error: 'empId is required' });

  const empId = normalizeId(req.body.empId);
  const emp = employees.find(e => normalizeId(e.id) === empId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const today = getTodayDate();
  attendanceRecords[empId] = attendanceRecords[empId] || {};

  if (attendanceRecords[empId][today] && attendanceRecords[empId][today].checkIn) {
    return res.status(400).json({ error: 'Already checked in today' });
  }

  const now = new Date();
  const istTime = now.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });

  attendanceRecords[empId][today] = { checkIn: istTime, checkOut: null };
  await saveAttendance();

  res.json({ message: `✅ Checked in at ${istTime} (IST). You can check out later.`, checkIn: istTime });
});

// Check-Out endpoint
app.post('/attendance/checkout', async (req, res) => {
  if (!req.body || !req.body.empId) return res.status(400).json({ error: 'empId is required' });

  const empId = normalizeId(req.body.empId);
  const emp = employees.find(e => normalizeId(e.id) === empId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const today = getTodayDate();
  if (!attendanceRecords[empId]?.[today]?.checkIn) {
    return res.status(400).json({ error: 'Check-in required before check-out' });
  }

  if (attendanceRecords[empId][today].checkOut) {
    return res.status(400).json({ error: 'Already checked out today' });
  }

  const now = new Date();
  const istTime = now.toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });

  attendanceRecords[empId][today].checkOut = istTime;
  await saveAttendance();

  res.json({ message: 'Check-out successful', checkOut: istTime });
});

// Add new employee
app.post('/employee', async (req, res) => {
  if (!req.body) return res.status(400).json({ error: 'Request body missing' });

  const id = req.body.id ? normalizeId(req.body.id) : null;
  const name = req.body.name ? req.body.name.trim() : null;

  if (!id || !name) {
    return res.status(400).json({ error: 'ID and Name are required' });
  }

  if (employees.find(emp => normalizeId(emp.id) === id)) {
    return res.status(409).json({ error: 'Employee with this ID already exists' });
  }

  if (employees.find(emp => emp.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'Employee with this name already exists' });
  }

  const newEmployee = { id, name };
  employees.push(newEmployee);

  try {
    await saveEmployees();
    res.json({ message: 'Employee added successfully', employee: newEmployee });
  } catch (err) {
    console.error('Failed to save employee:', err.message);
    res.status(500).json({ error: 'Failed to save employee' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Attendance backend running at http://localhost:${PORT}`);
});
