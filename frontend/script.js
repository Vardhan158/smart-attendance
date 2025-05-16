const btnFind = document.getElementById('btnFind');
const empIdInput = document.getElementById('empId');
const employeeInfoDiv = document.getElementById('employeeInfo');
const displayId = document.getElementById('displayId');
const displayName = document.getElementById('displayName');
const btnCheckIn = document.getElementById('btnCheckIn');
const btnCheckOut = document.getElementById('btnCheckOut');
const message = document.getElementById('message');

let currentEmpId = null;

const backendBase = 'http://localhost:3000';

btnFind.onclick = async () => {
  const empId = empIdInput.value.trim();
  if (!empId) {
    alert('Please enter Employee ID');
    return;
  }

  try {
    const empRes = await fetch(`${backendBase}/employee/${empId}`);
    if (empRes.status === 404) {
      alert('Employee not found');
      return;
    }
    const empData = await empRes.json();
    displayId.textContent = empData.id;
    displayName.textContent = empData.name;
    employeeInfoDiv.style.display = 'block';
    currentEmpId = empData.id;

    const today = new Date().toISOString().split('T')[0];
    const attRes = await fetch(`${backendBase}/attendance/${empId}/${today}`);
    const attData = await attRes.json();

    if (!attData.checkIn) {
      btnCheckIn.disabled = false;
      btnCheckOut.disabled = true;
      message.textContent = 'You have not checked in yet today.';
    } else if (attData.checkIn && !attData.checkOut) {
      btnCheckIn.disabled = true;
      btnCheckOut.disabled = false;
      message.textContent = `Checked in at ${attData.checkIn}. Please check out when done.`;
    } else {
      btnCheckIn.disabled = true;
      btnCheckOut.disabled = true;
      message.textContent = `Attendance complete for today. Checked in at ${attData.checkIn}, checked out at ${attData.checkOut}.`;
    }
  } catch (err) {
    alert('Error connecting to backend');
    console.error(err);
  }
};

btnCheckIn.onclick = async () => {
  if (!currentEmpId) return;
  try {
    const res = await fetch(`${backendBase}/attendance/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId: currentEmpId }),
    });
    const result = await res.json();
    if (res.ok) {
      alert('Check-in successful!');
      btnCheckIn.disabled = true;
      btnCheckOut.disabled = false;
      message.textContent = `Checked in at ${result.checkIn}. You can check out later.`;
    } else {
      alert(result.error);
    }
  } catch (err) {
    alert('Error during check-in');
  }
};

btnCheckOut.onclick = async () => {
  if (!currentEmpId) return;
  try {
    const res = await fetch(`${backendBase}/attendance/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId: currentEmpId }),
    });
    const result = await res.json();
    if (res.ok) {
      alert('Check-out successful!');
      btnCheckOut.disabled = true;
      message.textContent = `Attendance complete for today. Checked out at ${result.checkOut}.`;
    } else {
      alert(result.error);
    }
  } catch (err) {
    alert('Error during check-out');
  }
};
