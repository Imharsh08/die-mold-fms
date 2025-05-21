const STEPS = [
    "Receive Order", "Handover Drawing", "Model Designing", "Model Checking",
    "Get Metal", "Programming & Machining", "VMC Inspection", "Sampling"
];
const priorityWeights = { Urgent: 4, High: 3, Medium: 2, Low: 1 };

function toggleManagerFeatures() {
    const role = document.getElementById('userRole').value;
    document.getElementById('addTaskForm').classList.toggle('hidden', role !== 'manager');
    document.getElementById('initFMS').classList.toggle('hidden', role !== 'manager');
}

function renderStepInputs() {
    document.getElementById('stepPlannedDates').innerHTML = STEPS.map(step => `
        <input id="planned-${step.replace(/\s+/g, '-')}" type="date" placeholder="${step} - Planned" class="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500" required>
    `).join('');
}

async function initializeFMS() {
    if (document.getElementById('userRole').value !== 'manager') {
        alert('Only managers can initialize FMS.');
        return;
    }
    try {
        const response = await fetch('/api/initialize', { method: 'POST' });
        const result = await response.json();
        alert(result.message);
        renderTasks();
        renderEmailLog();
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

async function addTask() {
    if (document.getElementById('userRole').value !== 'manager') {
        alert('Only managers can add tasks.');
        return;
    }
    const orderId = document.getElementById('taskOrderId').value;
    const toolName = document.getElementById('taskToolName').value;
    const requestedBy = document.getElementById('taskRequestedBy').value;
    const priority = document.getElementById('taskPriority').value;
    const requiredBy = document.getElementById('taskRequiredBy').value;

    if (!orderId || !toolName || !requestedBy || !requiredBy) {
        alert('Please fill in all base fields.');
        return;
    }

    const steps = {};
    for (const step of STEPS) {
        const plannedDate = document.getElementById(`planned-${step.replace(/\s+/g, '-')}`).value;
        if (!plannedDate) {
            alert(`Please provide a planned date for ${step}.`);
            return;
        }
        steps[step] = plannedDate;
    }

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, tool_name: toolName, requested_by: requestedBy, priority, required_by: requiredBy, steps })
        });
        await response.json();
        clearForm();
        renderTasks();
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

async function markStepAsDone(taskId, step) {
    try {
        const response = await fetch(`/api/task_steps/${taskId}/${encodeURIComponent(step)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        alert(result.message);
        renderTasks();
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

async function checkDelayAlerts() {
    try {
        const response = await fetch('/api/check_delays');
        const result = await response.json();
        alert(`Delay check complete. ${result.alertsSent} alert${result.alertsSent === 1 ? '' : 's'} sent.`);
        renderEmailLog();
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

async function renderTasks() {
    try {
        const response = await fetch('/api/tasks');
        const tasks = await response.json();
        const pendingTasks = tasks.filter(task => task.steps.some(s => s.status !== 'Done'));
        const pendingTasksDiv = document.getElementById('pendingTasks');
        const priorityTasksDiv = document.getElementById('priorityTasks');
        const pendingCount = document.getElementById('pendingCount');

        pendingCount.textContent = pendingTasks.length;

        pendingTasksDiv.innerHTML = pendingTasks.map(task => `
            <div class="bg-white p-4 rounded-lg shadow-md card">
                <h3 class="text-lg font-semibold text-gray-800">Order ${task.order_id}: ${task.tool_name}</h3>
                <p class="text-sm text-gray-600"><strong>Requested By:</strong> ${task.requested_by}</p>
                <p class="text-sm text-gray-600"><strong>Priority:</strong> <span class="${task.priority === 'Urgent' ? 'text-red-500' : task.priority === 'High' ? 'text-orange-500' : 'text-gray-600'}">${task.priority}</span></p>
                <p class="text-sm text-gray-600"><strong>Required By:</strong> ${task.required_by}</p>
                <p class="text-sm text-gray-600 mt-2"><strong>Steps:</strong></p>
                <ul class="list-disc pl-5 text-sm text-gray-600">
                    ${STEPS.map(step => {
                        const stepData = task.steps.find(s => s.step_name === step);
                        return `
                            <li>
                                ${step}: ${stepData.status}
                                ${stepData.planned_date ? `(Planned: ${stepData.planned_date})` : ''}
                                ${stepData.actual_date ? `(Actual: ${stepData.actual_date})` : ''}
                                ${stepData.time_delay !== null ? `(Delay: ${stepData.time_delay.toFixed(2)} hours)` : ''}
                                ${stepData.status !== 'Done' ? `<button onclick="markStepAsDone(${task.id}, '${step}')" class="ml-2 text-blue-500 hover:underline text-sm p-1">Mark Done</button>` : ''}
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `).join('');

        const sortedTasks = [...pendingTasks].sort((a, b) => priorityWeights[b.priority] - priorityWeights[a.priority]);
        priorityTasksDiv.innerHTML = sortedTasks.slice(0, 5).map(task => `
            <div class="bg-white p-4 rounded-lg shadow-md card">
                <h3 class="text-lg font-semibold text-gray-800">Order ${task.order_id}: ${task.tool_name}</h3>
                <p class="text-sm text-gray-600"><strong>Requested By:</strong> ${task.requested_by}</p>
                <p class="text-sm text-gray-600"><strong>Priority:</strong> <span class="${task.priority === 'Urgent' ? 'text-red-500' : task.priority === 'High' ? 'text-orange-500' : 'text-gray-600'}">${task.priority}</span></p>
                <p class="text-sm text-gray-600"><strong>Required By:</strong> ${task.required_by}</p>
                <p class="text-sm text-gray-600 mt-2"><strong>Steps:</strong></p>
                <ul class="list-disc pl-5 text-sm text-gray-600">
                    ${STEPS.map(step => {
                        const stepData = task.steps.find(s => s.step_name === step);
                        return `
                            <li>
                                ${step}: ${stepData.status}
                                ${stepData.planned_date ? `(Planned: ${stepData.planned_date})` : ''}
                                ${stepData.actual_date ? `(Actual: ${stepData.actual_date})` : ''}
                                ${stepData.time_delay !== null ? `(Delay: ${stepData.time_delay.toFixed(2)} hours)` : ''}
                                ${stepData.status !== 'Done' ? `<button onclick="markStepAsDone(${task.id}, '${step}')" class="ml-2 text-blue-500 hover:underline text-sm p-1">Mark Done</button>` : ''}
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `).join('');
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

async function renderEmailLog() {
    try {
        const response = await fetch('/api/email_log');
        const logs = await response.json();
        document.getElementById('emailLog').innerHTML = `
            <table class="w-full border-collapse text-sm">
                <thead>
                    <tr class="bg-gray-200">
                        <th class="p-2 border">Order ID</th>
                        <th class="p-2 border">Step</th>
                        <th class="p-2 border">Alert Sent</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => `
                        <tr>
                            <td class="p-2 border">${log.order_id}</td>
                            <td class="p-2 border">${log.step_name}</td>
                            <td class="p-2 border">${new Date(log.alert_sent_time).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

async function viewDatabase() {
    try {
        const response = await fetch('/api/database');
        const data = await response.json();
        const databaseViewer = document.getElementById('databaseViewer');
        databaseViewer.innerHTML = `
            <h3 class="text-md font-semibold mb-2">Tasks Table</h3>
            <table class="w-full border-collapse text-sm mb-4">
                <thead>
                    <tr class="bg-gray-200">
                        <th class="p-2 border">ID</th>
                        <th class="p-2 border">Order ID</th>
                        <th class="p-2 border">Tool Name</th>
                        <th class="p-2 border">Requested By</th>
                        <th class="p-2 border">Priority</th>
                        <th class="p-2 border">Required By</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.tasks.map(task => `
                        <tr>
                            <td class="p-2 border">${task.id}</td>
                            <td class="p-2 border">${task.order_id}</td>
                            <td class="p-2 border">${task.tool_name}</td>
                            <td class="p-2 border">${task.requested_by}</td>
                            <td class="p-2 border">${task.priority}</td>
                            <td class="p-2 border">${task.required_by}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h3 class="text-md font-semibold mb-2">Task Steps Table</h3>
            <table class="w-full border-collapse text-sm mb-4">
                <thead>
                    <tr class="bg-gray-200">
                        <th class="p-2 border">Task ID</th>
                        <th class="p-2 border">Step Name</th>
                        <th class="p-2 border">Planned Date</th>
                        <th class="p-2 border">Actual Date</th>
                        <th class="p-2 border">Status</th>
                        <th class="p-2 border">Time Delay</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.task_steps.map(step => `
                        <tr>
                            <td class="p-2 border">${step.task_id}</td>
                            <td class="p-2 border">${step.step_name}</td>
                            <td class="p-2 border">${step.planned_date || ''}</td>
                            <td class="p-2 border">${step.actual_date || ''}</td>
                            <td class="p-2 border">${step.status}</td>
                            <td class="p-2 border">${step.time_delay !== null ? step.time_delay.toFixed(2) : ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h3 class="text-md font-semibold mb-2">Email Log Table</h3>
            <table class="w-full border-collapse text-sm">
                <thead>
                    <tr class="bg-gray-200">
                        <th class="p-2 border">Order ID</th>
                        <th class="p-2 border">Step Name</th>
                        <th class="p-2 border">Alert Sent Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.email_log.map(log => `
                        <tr>
                            <td class="p-2 border">${log.order_id}</td>
                            <td class="p-2 border">${log.step_name}</td>
                            <td class="p-2 border">${new Date(log.alert_sent_time).toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        alert(`Error: ${err.message}`);
    }
}

function clearForm() {
    document.getElementById('taskOrderId').value = '';
    document.getElementById('taskToolName').value = '';
    document.getElementById('taskRequestedBy').value = '';
    document.getElementById('taskPriority').value = 'Low';
    document.getElementById('taskRequiredBy').value = '';
    STEPS.forEach(step => {
        document.getElementById(`planned-${step.replace(/\s+/g, '-')}`).value = '';
    });
}

toggleManagerFeatures();
renderStepInputs();
renderTasks();
renderEmailLog();