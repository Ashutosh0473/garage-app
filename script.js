// Supabase Configuration
const SUPABASE_URL = "https://bitucnixtdoxvzwuvnnv.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZSLoRgQ5WhBpPcG1rRFT0g_eUhgXbGz";
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

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
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('garage_data')
            .select('data')
            .eq('id', 1)
            .single();

        if (error) {
            console.warn("Cloud data not found, will create on first save.", error);
            // Fallback to local storage
            jobs = JSON.parse(localStorage.getItem('garage_jobs')) || [];
            inventory = JSON.parse(localStorage.getItem('garage_inventory')) || [];
            expenses = JSON.parse(localStorage.getItem('garage_expenses')) || [];
            adminPass = localStorage.getItem('garage_admin_pass') || 'admin123';
            return;
        }

        if (data && data.data) {
            jobs = data.data.jobs || [];
            inventory = data.data.inventory || [];
            expenses = data.data.expenses || [];
            adminPass = data.data.adminPass || 'admin123';
            console.log("Data successfully loaded from Supabase.");
        }
    } catch (err) {
        console.error("Critical error loading cloud data:", err);
    }
}

async function saveDataToCloud() {
    // Save to LocalStorage first (Cache)
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
        const { error } = await supabase
            .from('garage_data')
            .upsert(payload);

        if (error) {
            console.error("Failed to sync to Supabase:", error);
        } else {
            console.log("Cloud sync successful.");
        }
    } catch (err) {
        console.error("Network error during sync:", err);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load initial data from Supabase
    await loadDataFromCloud();

    // Check session
    const isLoggedIn = sessionStorage.getItem('garage_logged_in');
    if (isLoggedIn) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        renderAll();
    } else {
        document.getElementById('login-form-entry').addEventListener('submit', handleLogin);
    }

    updateCarModelSuggestions();

    // Form Submissions
    document.getElementById('vehicle-form').addEventListener('submit', handleAddVehicle);
    document.getElementById('inventory-form').addEventListener('submit', handleInventorySubmit);
    document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            if (view === 'add-vehicle') {
                resetForm(); // Ensure form is fresh for new entry
            }
            showView(view);
        });
    });
});

// Holistic Render
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

function updateServiceSuggestions() {
    const datalist = document.getElementById('service-suggestions');
    if (!datalist) return;

    // Get unique existing services from jobs (looping through services array in jobs)
    let existingServices = [];
    jobs.forEach(job => {
        if (job.services && Array.isArray(job.services)) {
            job.services.forEach(s => {
                if (s.desc) existingServices.push(s.desc);
            });
        }
        if (job.service) existingServices.push(job.service); // Legacy
    });

    existingServices = [...new Set(existingServices)].filter(s => s && s !== '---');

    // Get currently displayed options to avoid duplicates
    const currentOptions = Array.from(datalist.options).map(o => o.value);

    existingServices.forEach(service => {
        if (!currentOptions.includes(service)) {
            const option = document.createElement('option');
            option.value = service;
            datalist.appendChild(option);
        }
    });
}

function updateCarModelSuggestions() {
    const datalist = document.getElementById('car-model-suggestions');
    if (!datalist) return;

    // Get unique existing models from jobs
    const existingModels = [...new Set(jobs.map(j => j.model).filter(m => m && m !== '---'))];

    // Get currently displayed options to avoid duplicates
    const currentOptions = Array.from(datalist.options).map(o => o.value);

    existingModels.forEach(model => {
        if (!currentOptions.includes(model)) {
            const option = document.createElement('option');
            option.value = model;
            datalist.appendChild(option);
        }
    });
}

// Auto-formatting Helpers
function handleNameInput(input) {
    const start = input.selectionStart;
    const end = input.selectionEnd;

    const words = input.value.split(' ');
    const formatted = words.map(word => {
        if (word.length === 0) return "";
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');

    input.value = formatted;
    input.setSelectionRange(start, end);
}

function handleVehicleNumInput(input) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(start, end);
}

// View Navigation
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

    const viewElement = document.getElementById(`${viewId}-view`);
    if (viewElement) viewElement.classList.add('active');

    document.querySelector(`[data-view="${viewId}"]`)?.classList.add('active');

    // Toggle Top Bar Controls Visibility
    const topBar = document.querySelector('.top-bar');
    if (topBar) {
        if (viewId === 'analytics' || viewId === 'settings') {
            topBar.classList.add('hide-controls');
        } else {
            topBar.classList.remove('hide-controls');
        }
    }

    if (viewId === 'history') {
        renderHistory();
    }
}

// Dynamic Service Rows
function addServiceRow(desc = '', spare = '', labour = '') {
    const list = document.getElementById('services-list');
    const row = document.createElement('div');
    row.className = 'service-item';
    row.style = 'display: grid; grid-template-columns: 1fr 120px 120px 40px; gap: 15px; margin-bottom: 10px; align-items: start; animation: fadeIn 0.3s ease;';
    row.innerHTML = `
        <div class="form-group" style="margin-bottom: 0;">
            <input type="text" class="service-desc" value="${desc}" placeholder="e.g. Brake Pads" list="service-suggestions" oninput="handleNameInput(this)" required style="padding: 10px; width: 100%;">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <input type="number" class="spare-cost" value="${spare}" placeholder="0" required style="padding: 10px; width: 100%; text-align: center;" oninput="calculateTotalFormCost()">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
            <input type="number" class="labour-cost" value="${labour}" placeholder="0" required style="padding: 10px; width: 100%; text-align: center;" oninput="calculateTotalFormCost()">
        </div>
        <button type="button" class="btn-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--accent-red); padding: 10px;" onclick="removeServiceRow(this)">
            <i data-lucide="trash-2" style="width: 18px;"></i>
        </button>
    `;
    list.appendChild(row);
    lucide.createIcons();
}

function removeServiceRow(btn) {
    const list = document.getElementById('services-list');
    if (list.children.length > 1) {
        btn.closest('.service-item').remove();
        calculateTotalFormCost();
    } else {
        alert("At least one service is required.");
    }
}

function calculateTotalFormCost() {
    const spareCosts = document.querySelectorAll('.spare-cost');
    const labourCosts = document.querySelectorAll('.labour-cost');
    let total = 0;

    spareCosts.forEach((input, index) => {
        const spare = Number(input.value) || 0;
        const labour = Number(labourCosts[index].value) || 0;
        total += (spare + labour);
    });

    document.getElementById('form-total-cost').innerText = `${CURRENCY}${total}`;
}

// Edit Functionality
function editVehicle(jobId) {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    editJobId = jobId;

    // Update UI Labels
    document.getElementById('form-title').innerText = "Edit Vehicle Details";
    document.getElementById('submit-btn').innerText = "Update Vehicle";

    // Fill basic details
    document.getElementById('owner-name').value = job.owner;
    document.getElementById('owner-phone').value = job.phone;
    document.getElementById('vehicle-number').value = job.vehicleNum;
    document.getElementById('car-model').value = job.model;

    // Fill services
    const list = document.getElementById('services-list');
    list.innerHTML = '';

    if (job.services && job.services.length > 0) {
        job.services.forEach(s => {
            const spare = s.spare !== undefined ? s.spare : (s.cost || 0);
            const labour = s.labour !== undefined ? s.labour : 0;
            addServiceRow(s.desc || s.service || '', spare, labour);
        });
    } else if (job.service) { // Fallback for very old legacy data
        addServiceRow(job.service, job.cost, 0);
    } else {
        addServiceRow();
    }

    calculateTotalFormCost();
    showView('add-vehicle');
}

function resetForm() {
    editJobId = null;
    document.getElementById('form-title').innerText = "Add Vehicle Details";
    document.getElementById('submit-btn').innerText = "Register Vehicle";
    document.getElementById('vehicle-form').reset();

    const list = document.getElementById('services-list');
    list.innerHTML = '';
    addServiceRow();
    calculateTotalFormCost();
}

function cancelForm() {
    resetForm();
    showView('dashboard');
}

// Filter Actions
function handleDateFilter() {
    const picker = document.getElementById('date-filter');
    filterDate = picker.value;

    const clearBtn = document.getElementById('clear-filter');
    if (filterDate) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
    }

    renderAll();
}

function clearDateFilter() {
    filterDate = "";
    document.getElementById('date-filter').value = "";
    document.getElementById('clear-filter').style.display = 'none';
    renderAll();
}

function handleSearch() {
    searchQuery = document.getElementById('global-search').value.toLowerCase();
    renderAll();
}

// Add/Update Vehicle
function handleAddVehicle(e) {
    e.preventDefault();

    const now = new Date();

    // Collect services
    const serviceRows = document.querySelectorAll('.service-item');
    const services = [];
    let totalSpare = 0;
    let totalLabour = 0;

    serviceRows.forEach(row => {
        const desc = row.querySelector('.service-desc').value;
        const spare = Number(row.querySelector('.spare-cost').value) || 0;
        const labour = Number(row.querySelector('.labour-cost').value) || 0;
        services.push({ desc, spare, labour });
        totalSpare += spare;
        totalLabour += labour;
    });

    const totalCost = totalSpare + totalLabour;

    if (editJobId) {
        // Update existing job
        const index = jobs.findIndex(j => j.id === editJobId);
        if (index !== -1) {
            jobs[index].owner = document.getElementById('owner-name').value;
            jobs[index].phone = document.getElementById('owner-phone').value;
            jobs[index].vehicleNum = (document.getElementById('vehicle-number').value).toUpperCase();
            jobs[index].model = document.getElementById('car-model').value;
            jobs[index].services = services;
            jobs[index].cost = totalCost;
            jobs[index].totalSpare = totalSpare;
            jobs[index].totalLabour = totalLabour;
        }
    } else {
        // Create new job
        const newJob = {
            id: Date.now(),
            owner: document.getElementById('owner-name').value || 'Unknown',
            phone: document.getElementById('owner-phone').value || '',
            vehicleNum: (document.getElementById('vehicle-number').value || '---').toUpperCase(),
            model: document.getElementById('car-model').value || '---',
            services: services,
            cost: totalCost,
            totalSpare: totalSpare,
            totalLabour: totalLabour,
            status: 'pending',
            dateISO: now.toISOString().split('T')[0],
            dateDisplay: now.toLocaleDateString('en-IN')
        };
        jobs.push(newJob);
    }

    saveJobs();
    renderAll();
    resetForm();
    showView('dashboard');
}

// Helper: Filter Logic
function getFilteredJobs() {
    return jobs.filter(job => {
        let dateMatch = true;
        if (filterDate) {
            const jobDate = job.dateISO || convertLegacyDate(job.dateDisplay);
            dateMatch = (jobDate === filterDate);
        }

        const owner = (job.owner || "").toLowerCase();
        const vNum = (job.vehicleNum || "").toLowerCase();
        const model = (job.model || "").toLowerCase();

        const searchMatch = !searchQuery ||
            owner.includes(searchQuery) ||
            vNum.includes(searchQuery) ||
            model.includes(searchQuery);

        return dateMatch && searchMatch;
    });
}

function convertLegacyDate(displayDate) {
    if (!displayDate) return "";
    const parts = displayDate.split('/');
    if (parts.length !== 3) return displayDate;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function formatServiceDisplay(job) {
    if (job.services && Array.isArray(job.services)) {
        if (job.services.length === 0) return '---';
        if (job.services.length === 1) return job.services[0].desc || 'Service';
        return `${job.services[0].desc || 'Service'} +${job.services.length - 1} more`;
    }
    return job.service || '---';
}

// Render Jobs Table (Dashboard - Pending Only)
function renderJobs() {
    const tbody = document.getElementById('jobs-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = getFilteredJobs();
    const pendingJobs = filtered.filter(j => j.status === 'pending').reverse();

    if (pendingJobs.length === 0) {
        const msg = filterDate || searchQuery ? "No matching active jobs found." : "No active service jobs.";
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #666; padding: 40px;">${msg}</td></tr>`;
        return;
    }

    pendingJobs.forEach(job => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${job.vehicleNum}</strong></td>
            <td>${job.owner}</td>
            <td>${job.model}</td>
            <td>${formatServiceDisplay(job)}</td>
            <td><span class="badge badge-pending">In Service</span></td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-primary" onclick="deliverVehicle(${job.id})" title="Deliver & Invoice">
                        <i data-lucide="check"></i> Deliver
                    </button>
                    <button class="btn-secondary" onclick="editVehicle(${job.id})" title="Edit Details">
                        <i data-lucide="edit-3"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

// Render History Table (All Jobs)
function renderHistory() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = getFilteredJobs();
    const sortedJobs = filtered.reverse();

    if (sortedJobs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #666; padding: 40px;">No matching service records.</td></tr>`;
        return;
    }

    sortedJobs.forEach(job => {
        const tr = document.createElement('tr');
        const statusClass = job.status === 'pending' ? 'badge-pending' : 'badge-completed';
        const statusText = job.status === 'pending' ? 'Ongoing' : 'Delivered';

        tr.innerHTML = `
            <td>${job.dateDisplay || job.date || '---'}</td>
            <td><strong>${job.vehicleNum}</strong></td>
            <td>${job.owner}</td>
            <td>${job.model}</td>
            <td>${formatServiceDisplay(job)}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>${CURRENCY}${job.cost}</td>
            <td>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-icon" style="color: var(--primary); padding: 6px; background: rgba(251, 176, 15, 0.1); border: 1px solid rgba(251, 176, 15, 0.3); border-radius: 6px;" title="View Full Details" onclick="viewJobDetails(${job.id})">
                        <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
                    </button>
                    ${job.status === 'completed' ? `
                        <button class="btn-icon" style="color: #FBB00F; padding: 6px; background: rgba(251, 176, 15, 0.1); border: 1px solid rgba(251, 176, 15, 0.3); border-radius: 6px; cursor: pointer;" title="Undo Delivery" onclick="window.restoreJob(${job.id})">
                            <i data-lucide="rotate-ccw" style="width: 16px; height: 16px;"></i>
                        </button>
                    ` : `
                        <button class="btn-icon" style="color: var(--primary); padding: 6px; background: rgba(0, 210, 255, 0.1); border: 1px solid rgba(0, 210, 255, 0.3); border-radius: 6px;" title="Edit Details" onclick="editVehicle(${job.id})">
                            <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                        </button>
                    `}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

// Global function to restore job
window.restoreJob = function (jobId) {
    const index = jobs.findIndex(j => j.id === jobId);
    if (index === -1) return;
    jobs[index].status = 'pending';
    saveJobs();
    renderAll();
};

// Update Stats
function updateStats() {
    const filteredJobs = getFilteredJobs();
    const active = filteredJobs.filter(j => j.status === 'pending').length;
    const completed = filteredJobs.filter(j => j.status === 'completed').length;
    const revenue = filteredJobs.filter(j => j.status === 'completed').reduce((acc, curr) => acc + (Number(curr.cost) || 0), 0);

    // Calculate Expenses
    const totalExpenses = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const netProfit = revenue - totalExpenses;

    const activeCountEl = document.getElementById('active-jobs-count');
    const completedCountEl = document.getElementById('completed-jobs-count');
    const revenueEl = document.getElementById('total-revenue');
    const expenseStatEl = document.getElementById('total-expenses-stat');
    const profitStatEl = document.getElementById('net-profit-stat');

    if (activeCountEl) activeCountEl.innerText = active;
    if (completedCountEl) completedCountEl.innerText = completed;
    if (revenueEl) revenueEl.innerText = `${CURRENCY}${revenue}`;
    if (expenseStatEl) expenseStatEl.innerText = `${CURRENCY}${totalExpenses}`;
    if (profitStatEl) {
        profitStatEl.innerText = `${CURRENCY}${netProfit}`;
        profitStatEl.style.color = netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    }
}

// Deliver Vehicle & Open Invoice
function deliverVehicle(jobId) {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    currentInvoiceJob = job;

    document.getElementById('inv-date').innerText = `Date: ${job.dateDisplay || job.date}`;
    document.getElementById('inv-number').innerText = `Invoice #: INV-${jobId.toString().slice(-6)}`;
    document.getElementById('inv-owner-name').innerText = job.owner;
    document.getElementById('inv-owner-phone').innerText = job.phone;
    document.getElementById('inv-vehicle-num').innerText = job.vehicleNum;
    document.getElementById('inv-car-model').innerText = job.model;

    const itemsBody = document.getElementById('inv-items-body');
    itemsBody.innerHTML = '';

    if (job.services && Array.isArray(job.services)) {
        job.services.forEach(item => {
            const spare = item.spare !== undefined ? item.spare : (item.cost || 0);
            const labour = item.labour !== undefined ? item.labour : 0;
            const rowTotal = spare + labour;

            itemsBody.innerHTML += `
                <tr>
                    <td>${item.desc || 'Service'}</td>
                    <td class="text-right">${CURRENCY}${spare}</td>
                    <td class="text-right">${CURRENCY}${labour}</td>
                    <td class="text-right">${CURRENCY}${rowTotal}</td>
                </tr>
            `;
        });
    } else {
        itemsBody.innerHTML = `
            <tr>
                <td>${job.service || '---'}</td>
                <td class="text-right">${CURRENCY}${job.cost}</td>
                <td class="text-right">${CURRENCY}0</td>
                <td class="text-right">${CURRENCY}${job.cost}</td>
            </tr>
        `;
    }

    document.getElementById('inv-total').innerText = `${CURRENCY}${job.cost}`;

    job.status = 'completed';
    saveJobs();
    renderAll();

    document.getElementById('invoice-modal').style.display = 'flex';
    lucide.createIcons();
}

function closeInvoice() {
    document.getElementById('invoice-modal').style.display = 'none';
}

function closeModalOnOverlay(e) {
    if (e.target.id === 'invoice-modal') {
        closeInvoice();
    }
}

function printInvoice() {
    window.print();
}

async function downloadInvoicePDF() {
    const btn = document.querySelector('.modal-actions .btn-primary[style*="background: #2563eb"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Generating...';
    lucide.createIcons();

    try {
        const element = document.getElementById('printable-invoice');
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        const fileName = `Invoice_${currentInvoiceJob.vehicleNum}_${currentInvoiceJob.dateISO}.pdf`;
        pdf.save(fileName);

        btn.innerHTML = '<i data-lucide="check"></i> PDF Saved!';
        setTimeout(() => {
            btn.innerHTML = originalText;
            lucide.createIcons();
        }, 2000);
    } catch (error) {
        console.error('PDF Error:', error);
        alert('Failed to generate PDF. Please use the Print option.');
        btn.innerHTML = originalText;
    }
    lucide.createIcons();
}

function sendInvoiceWhatsApp() {
    if (!currentInvoiceJob) return;

    if (confirm("Would you like to download the PDF Invoice first so you can attach it to the WhatsApp message?")) {
        downloadInvoicePDF();
    }

    const job = currentInvoiceJob;
    let serviceText = "";

    if (job.services && Array.isArray(job.services)) {
        job.services.forEach(s => {
            const spare = s.spare !== undefined ? s.spare : (s.cost || 0);
            const labour = s.labour !== undefined ? s.labour : 0;
            serviceText += `%0A- *${s.desc || 'Service'}*: Spares ${CURRENCY}${spare}, Labour ${CURRENCY}${labour}`;
        });
    } else {
        serviceText = `%0A- *${job.service}*: ${CURRENCY}${job.cost}`;
    }

    const message = `*MECHANISTIC AUTOMOTIVE SERVICES*%0A%0AHello *${job.owner}*,%0AYour vehicle *${job.model}* (${job.vehicleNum}) is ready for delivery!%0A%0A*Detailed Billing:*${serviceText}%0A%0A*Total Amount:* ${CURRENCY}${job.cost}%0A%0AThank you for choosing us!%0A_Mechanistic Automotive Services_`;

    const waUrl = `https://wa.me/${job.phone}?text=${message}`;
    window.open(waUrl, '_blank');
}

function saveJobs() {
    saveDataToCloud();
}

function exportData() {
    const dataStr = JSON.stringify(jobs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `mechanistic_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedJobs = JSON.parse(e.target.result);
            if (Array.isArray(importedJobs)) {
                jobs = importedJobs;
                saveJobs();
                renderAll();
                alert('Data successfully imported!');
            }
        } catch (err) {
            alert('Integrity check failed: Invalid backup file.');
        }
    };
    reader.readAsText(file);
}

function exportHistoryToExcel() {
    if (jobs.length === 0) {
        alert("No history data to export.");
        return;
    }

    // CSV Headers
    const headers = ["Date", "Vehicle Number", "Owner Name", "Phone", "Car Model", "Service Description", "Status", "Total Cost (INR)"];

    // Prepare Data Rows
    const rows = jobs.map(job => {
        const services = job.services && Array.isArray(job.services)
            ? job.services.map(s => s.desc).join(" | ")
            : (job.service || "---");

        return [
            job.dateDisplay || job.date || "---",
            job.vehicleNum || "---",
            job.owner || "---",
            job.phone || "---",
            job.model || "---",
            `"${services}"`, // Wrap in quotes to handle separators
            job.status === 'pending' ? 'In Service' : 'Delivered',
            job.cost || 0
        ];
    });

    // Combine headers and rows
    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(","))
    ].join("\n");

    // Download Logic
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `mechanistic_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// Customers View Logic
function renderCustomers() {
    const tbody = document.getElementById('customers-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Group jobs by customer phone (unique identifier)
    const customerMap = {};
    jobs.forEach(job => {
        const phone = job.phone || 'Unknown';
        const name = job.owner || 'Unknown';

        // Filter by search query if present
        if (searchQuery) {
            const match = name.toLowerCase().includes(searchQuery) ||
                phone.toLowerCase().includes(searchQuery) ||
                (job.vehicleNum || "").toLowerCase().includes(searchQuery);
            if (!match) return;
        }

        if (!customerMap[phone]) {
            customerMap[phone] = {
                name: name,
                phone: phone,
                vehicles: new Set(),
                visits: 0,
                totalSpend: 0
            };
        }
        customerMap[phone].vehicles.add(job.model);
        customerMap[phone].visits++;
        if (job.status === 'completed') {
            customerMap[phone].totalSpend += (Number(job.cost) || 0);
        }
    });

    const customerList = Object.values(customerMap).sort((a, b) => b.totalSpend - a.totalSpend);
    document.getElementById('total-customers-count').innerText = customerList.length;

    if (customerList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #666; padding: 40px;">No customers registered yet.</td></tr>`;
        return;
    }

    customerList.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${c.name}</strong></td>
            <td>${c.phone}</td>
            <td>${Array.from(c.vehicles).join(', ') || '---'}</td>
            <td>${c.visits}</td>
            <td style="color: var(--accent-green); font-weight: 700;">${CURRENCY}${c.totalSpend}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Inventory Logic
function renderInventory() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filteredInventory = inventory.filter(item => {
        if (!searchQuery) return true;
        return (item.name || "").toLowerCase().includes(searchQuery) ||
            (item.category || "").toLowerCase().includes(searchQuery);
    });

    if (filteredInventory.length === 0) {
        const msg = searchQuery ? "No matching spare parts found." : "No spare parts in stock.";
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #666; padding: 40px;">${msg}</td></tr>`;
        return;
    }

    filteredInventory.forEach(item => {
        const statusClass = item.stock < 5 ? 'badge-pending' : 'badge-completed';
        const statusText = item.stock < 5 ? 'Low Stock' : 'In Stock';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td>${item.category}</td>
            <td>${item.stock} Units</td>
            <td>${CURRENCY}${item.price}</td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-icon" style="color: var(--primary); padding: 6px;" title="Edit" onclick="editInventoryItem(${item.id})">
                        <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                    </button>
                    <button class="btn-icon" style="color: var(--accent-red); padding: 6px;" title="Delete" onclick="deleteInventoryItem(${item.id})">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function showInventoryModal(id = null) {
    const modal = document.getElementById('inventory-modal');
    const form = document.getElementById('inventory-form');
    form.reset();
    editPartId = id;

    if (id) {
        const item = inventory.find(i => i.id === id);
        if (item) {
            document.getElementById('part-id').value = item.id;
            document.getElementById('part-name').value = item.name;
            document.getElementById('part-category').value = item.category;
            document.getElementById('part-stock').value = item.stock;
            document.getElementById('part-price').value = item.price;
        }
    }

    modal.style.display = 'flex';
}

function closeInventoryModal() {
    document.getElementById('inventory-modal').style.display = 'none';
}

function closeInventoryModalOnOverlay(e) {
    if (e.target.id === 'inventory-modal') closeInventoryModal();
}

function handleInventorySubmit(e) {
    e.preventDefault();
    const id = editPartId || Date.now();
    const newItem = {
        id: id,
        name: document.getElementById('part-name').value,
        category: document.getElementById('part-category').value,
        stock: Number(document.getElementById('part-stock').value),
        price: Number(document.getElementById('part-price').value)
    };

    if (editPartId) {
        const index = inventory.findIndex(i => i.id === editPartId);
        inventory[index] = newItem;
    } else {
        inventory.push(newItem);
    }

    saveInventory();
    renderInventory();
    closeInventoryModal();
}

function editInventoryItem(id) {
    showInventoryModal(id);
}

function deleteInventoryItem(id) {
    if (confirm("Are you sure you want to remove this item from inventory?")) {
        inventory = inventory.filter(i => i.id !== id);
        saveInventory();
        renderInventory();
    }
}

function saveInventory() {
    saveDataToCloud();
}

// Expenses Logic
function renderExpenses() {
    const tbody = document.getElementById('expenses-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #666; padding: 40px;">No expenses logged.</td></tr>`;
        return;
    }

    expenses.slice().reverse().forEach(exp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${exp.date || '---'}</td>
            <td><strong>${exp.desc}</strong></td>
            <td><span class="badge" style="background: rgba(255,255,255,0.05);">${exp.category}</span></td>
            <td style="color: var(--accent-red); font-weight: 700;">${CURRENCY}${exp.amount}</td>
            <td>
                <button class="btn-icon" style="color: var(--accent-red); padding: 6px;" title="Delete" onclick="deleteExpense(${exp.id})">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function showExpenseModal() {
    document.getElementById('expense-form').reset();
    editExpenseId = null;
    document.getElementById('expense-modal').style.display = 'flex';
}

function closeExpenseModal() {
    document.getElementById('expense-modal').style.display = 'none';
}

function closeExpenseModalOnOverlay(e) {
    if (e.target.id === 'expense-modal') closeExpenseModal();
}

function handleExpenseSubmit(e) {
    e.preventDefault();
    const newExp = {
        id: Date.now(),
        desc: document.getElementById('expense-desc').value,
        category: document.getElementById('expense-category').value,
        amount: Number(document.getElementById('expense-amount').value),
        date: new Date().toLocaleDateString('en-IN')
    };

    expenses.push(newExp);
    saveExpenses();
    renderAll();
    closeExpenseModal();
}

function deleteExpense(id) {
    if (confirm("Delete this expense record?")) {
        expenses = expenses.filter(e => e.id !== id);
        saveExpenses();
        renderAll();
    }
}

function saveExpenses() {
    saveDataToCloud();
}

// Job Detail Lookup
function viewJobDetails(jobId) {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    const content = document.getElementById('job-details-content');
    let serviceRows = '';

    if (job.services && Array.isArray(job.services)) {
        job.services.forEach(s => {
            serviceRows += `
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 10px 0;">
                    <span style="font-weight: 600;">${s.desc}</span>
                    <span style="color: #666;">Spare: ${CURRENCY}${s.spare} | Labour: ${CURRENCY}${s.labour}</span>
                </div>
            `;
        });
    }

    content.innerHTML = `
        <div style="text-align: center; margin-bottom: 25px;">
            <h2 style="color: #1a1a1a;">Service Details</h2>
            <p style="color: #666;">ID: JOB-${jobId.toString().slice(-6)} | Date: ${job.dateDisplay}</p>
        </div>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #eee;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <label style="font-size: 0.75rem; text-transform: uppercase; color: #999; font-weight: 700;">Owner</label>
                    <p style="font-weight: 700; color: #1a1a1a;">${job.owner}</p>
                    <p style="font-size: 0.9rem; color: #666;">${job.phone}</p>
                </div>
                <div style="text-align: right;">
                    <label style="font-size: 0.75rem; text-transform: uppercase; color: #999; font-weight: 700;">Vehicle</label>
                    <p style="font-weight: 700; color: #1a1a1a;">${job.vehicleNum}</p>
                    <p style="font-size: 0.9rem; color: #666;">${job.model}</p>
                </div>
            </div>
        </div>

        <div style="margin-bottom: 25px;">
            <h4 style="margin-bottom: 10px; color: #1a1a1a; border-left: 4px solid var(--primary); padding-left: 10px;">Services Performed</h4>
            <div style="max-height: 200px; overflow-y: auto;">
                ${serviceRows || '<p style="color: #999;">No service data available.</p>'}
            </div>
        </div>

        <div style="background: rgba(251, 176, 15, 0.05); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px dashed var(--primary);">
            <span style="font-weight: 700; color: #1a1a1a;">Grand Total Paid:</span>
            <span style="font-size: 1.4rem; font-weight: 800; color: var(--primary-dark);">${CURRENCY}${job.cost}</span>
        </div>
    `;

    document.getElementById('reprint-btn').onclick = () => {
        closeViewJobModal();
        deliverVehicle(jobId); // Reuse deliver function for invoice view
    };

    document.getElementById('view-job-modal').style.display = 'flex';
    lucide.createIcons();
}

function closeViewJobModal() {
    document.getElementById('view-job-modal').style.display = 'none';
}

function closeViewJobModalOnOverlay(e) {
    if (e.target.id === 'view-job-modal') closeViewJobModal();
}

// Analytics Logic (CSS Based Charts)
function renderAnalytics() {
    const revenueChart = document.getElementById('revenue-chart');
    const serviceChart = document.getElementById('service-chart');
    if (!revenueChart || !serviceChart) return;

    // 1. Revenue Chart (Last 6 Months)
    revenueChart.innerHTML = '';
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = d.toLocaleString('default', { month: 'short' });
        const monthYear = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;

        const monthRev = jobs.filter(j => j.status === 'completed' && (j.dateISO || '').startsWith(monthYear))
            .reduce((acc, curr) => acc + (Number(curr.cost) || 0), 0);
        months.push({ label: monthName, value: monthRev });
    }

    const maxVal = Math.max(...months.map(m => m.value), 1000);
    months.forEach(m => {
        const height = (m.value / maxVal) * 100;
        const bar = document.createElement('div');
        bar.style = `flex: 1; display: flex; flex-direction: column; align-items: center; gap: 10px;`;
        bar.innerHTML = `
            <div style="font-size: 0.7rem; color: var(--text-grey);">${CURRENCY}${m.value > 1000 ? (m.value / 1000).toFixed(1) + 'k' : m.value}</div>
            <div style="width: 100%; height: ${height}%; background: var(--primary); border-radius: 4px 4px 0 0; min-height: 2px; transition: height 1s ease;"></div>
            <div style="font-size: 0.8rem; font-weight: 600;">${m.label}</div>
        `;
        revenueChart.appendChild(bar);
    });

    // 2. Service Popularity
    serviceChart.innerHTML = '';
    const serviceCounts = {};
    jobs.forEach(j => {
        if (j.services) {
            j.services.forEach(s => {
                const name = s.desc || 'Other';
                serviceCounts[name] = (serviceCounts[name] || 0) + 1;
            });
        }
    });

    const sortedServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCount = Math.max(...sortedServices.map(s => s[1]), 1);

    sortedServices.forEach(([name, count]) => {
        const percentage = (count / maxCount) * 100;
        const row = document.createElement('div');
        row.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9rem;">
                <span>${name}</span>
                <span style="color: var(--text-grey);">${count} jobs</span>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden;">
                <div style="width: ${percentage}%; height: 100%; background: var(--primary); transition: width 1s ease;"></div>
            </div>
        `;
        serviceChart.appendChild(row);
    });
}

// Authentication Logic
function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const errorEl = document.getElementById('login-error');

    // Check against stored password
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

window.forgotPassword = function () {
    if (confirm("Forgotten your password? Click OK to reset it back to the default: 'admin123'")) {
        adminPass = 'admin123';
        saveDataToCloud();
        alert("Password has been reset to: admin123\n\nYou can now log in.");
    }
}

window.logout = function () {
    console.log("Logout triggered");
    // Removed confirm to ensure it works even if dialogs are blocked
    try {
        sessionStorage.removeItem('garage_logged_in');
        document.body.style.transition = 'opacity 0.3s ease';
        document.body.style.opacity = '0';
        setTimeout(() => {
            window.location.href = window.location.href; // Force reload
        }, 300);
    } catch (e) {
        console.error("Logout failed", e);
        // Emergency fallback
        window.location.reload();
    }
}

function changePassword(e) {
    if (e) e.preventDefault();
    const current = document.getElementById('current-pass').value;
    const newPass = document.getElementById('new-pass').value;
    const confirmPass = document.getElementById('confirm-pass').value;

    if (current !== adminPass) {
        alert("Current password incorrect!");
        return;
    }

    if (newPass !== confirmPass) {
        alert("New passwords do not match!");
        return;
    }

    if (newPass.length < 4) {
        alert("Password too short (min 4 characters)");
        return;
    }

    adminPass = newPass;
    saveDataToCloud();
    alert("Password updated successfully!");
    document.getElementById('change-pass-form').reset();
}
