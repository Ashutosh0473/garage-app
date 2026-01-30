// Supabase Configuration
const SUPABASE_URL = "https://bitucnixtdoxvzwuvnnv.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZSLoRgQ5WhBpPcG1rRFT0g_eUhgXbGz";

// Initialize Supabase
let supabase = null;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase Client Initialized");
    }
} catch (e) {
    console.error("Error initializing Supabase:", e);
}

// State Management
let jobs = [];
let inventory = [];
let expenses = [];
let currentInvoiceJob = null;
let editJobId = null;
let editPartId = null;
let editExpenseId = null;
let filterDate = "";
let searchQuery = "";
const CURRENCY = "₹";
let adminPass = 'admin123';

// Cloud Storage Helpers
async function loadDataFromCloud() {
    console.log("Fetching data from Cloud...");
    if (!supabase) {
        loadLocalFallback();
        return;
    }
    try {
        const { data, error } = await supabase
            .from('garage_data')
            .select('data')
            .eq('id', 1)
            .single();

        if (error) {
            console.error("Cloud Error:", error.message);
            loadLocalFallback();
            return;
        }

        if (data && data.data) {
            jobs = data.data.jobs || [];
            inventory = data.data.inventory || [];
            expenses = data.data.expenses || [];
            adminPass = data.data.adminPass || 'admin123';
            console.log("Data loaded from Cloud.");
        }
    } catch (err) {
        console.error("Critical Cloud Error:", err);
        loadLocalFallback();
    }
}

function loadLocalFallback() {
    jobs = JSON.parse(localStorage.getItem('garage_jobs')) || [];
    inventory = JSON.parse(localStorage.getItem('garage_inventory')) || [];
    expenses = JSON.parse(localStorage.getItem('garage_expenses')) || [];
    adminPass = localStorage.getItem('garage_admin_pass') || 'admin123';
}

async function saveDataToCloud() {
    localStorage.setItem('garage_jobs', JSON.stringify(jobs));
    localStorage.setItem('garage_inventory', JSON.stringify(inventory));
    localStorage.setItem('garage_expenses', JSON.stringify(expenses));
    localStorage.setItem('garage_admin_pass', adminPass);

    if (!supabase) return;

    const payload = {
        id: 1,
        data: { jobs, inventory, expenses, adminPass },
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabase.from('garage_data').upsert(payload);
        if (error) console.error("Sync Error:", error.message);
        else console.log("Cloud Saved.");
    } catch (err) {
        console.error("Sync Exception:", err);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadDataFromCloud();

    const isLoggedIn = sessionStorage.getItem('garage_logged_in');
    if (isLoggedIn) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        renderAll();
    } else {
        document.getElementById('login-form-entry').addEventListener('submit', handleLogin);
    }

    updateCarModelSuggestions();

    document.getElementById('vehicle-form').addEventListener('submit', handleAddVehicle);
    document.getElementById('inventory-form').addEventListener('submit', handleInventorySubmit);
    document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            if (view === 'add-vehicle') resetForm();
            showView(view);
        });
    });

    lucide.createIcons();
});

function renderAll() {
    renderJobs();
    renderHistory();
    renderCustomers();
    renderInventory();
    renderExpenses();
    renderAnalytics();
    updateStats();
    updateCarModelSuggestions();
    updateServiceSuggestions();
}

// Authentication
function handleLogin(e) {
    if (e) e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const errorEl = document.getElementById('login-error');

    if (user === 'admin' && pass === adminPass) {
        sessionStorage.setItem('garage_logged_in', 'true');
        document.getElementById('login-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'flex';
            renderAll();
        }, 300);
    } else {
        errorEl.style.display = 'block';
        errorEl.style.animation = 'shake 0.5s ease';
        setTimeout(() => { errorEl.style.animation = ''; }, 500);
    }
}

// Navigation
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const viewElement = document.getElementById(`${viewId}-view`);
    if (viewElement) viewElement.classList.add('active');
    document.querySelector(`[data-view="${viewId}"]`)?.classList.add('active');

    const topBar = document.querySelector('.top-bar');
    if (topBar) {
        if (viewId === 'analytics' || viewId === 'settings') topBar.classList.add('hide-controls');
        else topBar.classList.remove('hide-controls');
    }
}

// Jobs Logic
function handleAddVehicle(e) {
    e.preventDefault();
    const serviceRows = document.querySelectorAll('.service-item');
    const services = [];
    let totalSpare = 0, totalLabour = 0;

    serviceRows.forEach(row => {
        const desc = row.querySelector('.service-desc').value;
        const spare = Number(row.querySelector('.spare-cost').value) || 0;
        const labour = Number(row.querySelector('.labour-cost').value) || 0;
        services.push({ desc, spare, labour });
        totalSpare += spare; totalLabour += labour;
    });

    const totalCost = totalSpare + totalLabour;
    const now = new Date();

    if (editJobId) {
        const idx = jobs.findIndex(j => j.id === editJobId);
        if (idx !== -1) {
            jobs[idx].owner = document.getElementById('owner-name').value;
            jobs[idx].phone = document.getElementById('owner-phone').value;
            jobs[idx].vehicleNum = document.getElementById('vehicle-number').value.toUpperCase();
            jobs[idx].model = document.getElementById('car-model').value;
            jobs[idx].services = services;
            jobs[idx].cost = totalCost;
        }
    } else {
        jobs.push({
            id: Date.now(),
            owner: document.getElementById('owner-name').value,
            phone: document.getElementById('owner-phone').value,
            vehicleNum: document.getElementById('vehicle-number').value.toUpperCase(),
            model: document.getElementById('car-model').value,
            services: services,
            cost: totalCost,
            status: 'pending',
            dateISO: now.toISOString().split('T')[0],
            dateDisplay: now.toLocaleDateString('en-IN')
        });
    }

    saveDataToCloud();
    renderAll();
    resetForm();
    showView('dashboard');
}

function renderJobs() {
    const tbody = document.getElementById('jobs-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const pending = jobs.filter(j => j.status === 'pending').slice().reverse();
    pending.forEach(job => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${job.vehicleNum}</strong></td>
            <td>${job.owner}</td>
            <td>${job.model}</td>
            <td><span class="badge badge-pending">Active</span></td>
            <td>
                <button class="btn-primary" onclick="deliverVehicle(${job.id})">Deliver</button>
                <button class="btn-secondary" onclick="editVehicle(${job.id})">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function renderHistory() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    jobs.slice().reverse().forEach(job => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${job.dateDisplay}</td>
            <td>${job.vehicleNum}</td>
            <td>${job.owner}</td>
            <td>${job.cost}</td>
            <td><span class="badge ${job.status === 'pending' ? 'badge-pending' : 'badge-completed'}">${job.status}</span></td>
            <td><button onclick="viewJobDetails(${job.id})">View</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function deliverVehicle(jobId) {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    job.status = 'completed';
    saveDataToCloud();
    renderAll();
    // Simplified Invoice Logic
    alert("Vehicle Delivered! Invoice generated in memory.");
}

function resetForm() {
    editJobId = null;
    document.getElementById('vehicle-form').reset();
    document.getElementById('services-list').innerHTML = '';
    addServiceRow();
    document.getElementById('form-total-cost').innerText = '₹0';
}

function addServiceRow(desc = '', spare = '', labour = '') {
    const list = document.getElementById('services-list');
    const div = document.createElement('div');
    div.className = 'service-item';
    div.style = 'display: grid; grid-template-columns: 1fr 120px 120px 40px; gap: 15px; margin-bottom: 10px;';
    div.innerHTML = `
        <input type="text" class="service-desc" value="${desc}" placeholder="Service Name" required>
        <input type="number" class="spare-cost" value="${spare}" placeholder="Spare" oninput="calculateTotalFormCost()">
        <input type="number" class="labour-cost" value="${labour}" placeholder="Labour" oninput="calculateTotalFormCost()">
        <button type="button" onclick="this.parentElement.remove(); calculateTotalFormCost();">X</button>
    `;
    list.appendChild(div);
}

function calculateTotalFormCost() {
    let total = 0;
    document.querySelectorAll('.service-item').forEach(row => {
        total += (Number(row.querySelector('.spare-cost').value) || 0) + (Number(row.querySelector('.labour-cost').value) || 0);
    });
    document.getElementById('form-total-cost').innerText = CURRENCY + total;
}

// Helpers
function updateCarModelSuggestions() { }
function updateServiceSuggestions() { }
function renderCustomers() { }
function renderInventory() { }
function renderExpenses() { }
function renderAnalytics() { }
function updateStats() {
    const active = jobs.filter(j => j.status === 'pending').length;
    document.getElementById('active-jobs-count').innerText = active;
}

function handleInventorySubmit(e) { e.preventDefault(); }
function handleExpenseSubmit(e) { e.preventDefault(); }
function viewJobDetails(id) { alert("Details for job " + id); }
window.forgotPassword = function () {
    if (confirm("Reset password?")) { adminPass = 'admin123'; saveDataToCloud(); alert("Done."); }
};
