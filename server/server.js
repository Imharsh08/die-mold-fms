const express = require('express');
const cors = require('cors');
const db = require('./database');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('../public'));

const ALERT_THRESHOLD_HOURS = 48;
const STEPS = [
    "Receive Order", "Handover Drawing", "Model Designing", "Model Checking",
    "Get Metal", "Programming & Machining", "VMC Inspection", "Sampling"
];

app.post('/api/initialize', (req, res) => {
    db.run('DELETE FROM tasks', (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run('DELETE FROM task_steps', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.run('DELETE FROM email_log', (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'FMS Initialized Successfully' });
            });
        });
    });
});

app.post('/api/tasks', (req, res) => {
    const { order_id, tool_name, requested_by, priority, required_by, steps } = req.body;
    db.run(
        `INSERT INTO tasks (order_id, timestamp, tool_name, requested_by, priority, required_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [order_id, new Date().toISOString(), tool_name, requested_by, priority, required_by],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const taskId = this.lastID;
            const stepInserts = STEPS.map(step => new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO task_steps (task_id, step_name, planned_date, status)
                     VALUES (?, ?, ?, 'Pending')`,
                    [taskId, step, steps[step]],
                    (err) => err ? reject(err) : resolve()
                );
            }));
            Promise.all(stepInserts)
                .then(() => res.json({ id: taskId }))
                .catch(err => res.status(500).json({ error: err.message }));
        }
    );
});

app.post('/api/task_steps/:taskId/:stepName', (req, res) => {
    const { taskId, stepName } = req.params;
    const actualDate = new Date().toISOString().split('T')[0];
    db.get(
        `SELECT planned_date FROM task_steps WHERE task_id = ? AND step_name = ?`,
        [taskId, stepName],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Step not found' });
            const plannedDate = new Date(row.planned_date);
            const actual = new Date(actualDate);
            const timeDelay = (actual - plannedDate) / (1000 * 60 * 60);
            db.run(
                `UPDATE task_steps SET status = 'Done', actual_date = ?, time_delay = ?
                 WHERE task_id = ? AND step_name = ?`,
                [actualDate, timeDelay, taskId, stepName],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: `Step ${stepName} marked as Done` });
                }
            );
        }
    );
});

app.get('/api/tasks', (req, res) => {
    db.all(`SELECT * FROM tasks`, (err, tasks) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(`SELECT * FROM task_steps`, (err, steps) => {
            if (err) return res.status(500).json({ error: err.message });
            const tasksWithSteps = tasks.map(task => ({
                ...task,
                steps: steps.filter(step => step.task_id === task.id)
            }));
            res.json(tasksWithSteps);
        });
    });
});

app.get('/api/check_delays', (req, res) => {
    db.all(
        `SELECT t.order_id, ts.step_name, ts.planned_date
         FROM tasks t
         JOIN task_steps ts ON t.id = ts.task_id
         WHERE ts.status != 'Done' AND ts.planned_date IS NOT NULL
         AND (julianday('now') - julianday(ts.planned_date)) * 24 > ?`,
        [ALERT_THRESHOLD_HOURS],
        (err, delayedSteps) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all(`SELECT order_id, step_name FROM email_log`, (err, logs) => {
                if (err) return res.status(500).json({ error: err.message });
                const alerts = [];
                delayedSteps.forEach(step => {
                    if (!logs.some(log => log.order_id === step.order_id && log.step_name === step.step_name)) {
                        alerts.push({
                            order_id: step.order_id,
                            step_name: step.step_name,
                            alert_sent_time: new Date().toISOString()
                        });
                        db.run(
                            `INSERT INTO email_log (order_id, step_name, alert_sent_time)
                             VALUES (?, ?, ?)`,
                            [step.order_id, step.step_name, new Date().toISOString()],
                            (err) => {
                                if (err) console.error('Error logging alert:', err);
                                console.log(`Simulated email for Order ${step.order_id}, Step: ${step.step_name}`);
                            }
                        );
                    }
                });
                res.json({ alertsSent: alerts.length });
            });
        }
    );
});

app.get('/api/email_log', (req, res) => {
    db.all(`SELECT * FROM email_log`, (err, logs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(logs);
    });
});

app.get('/api/database', (req, res) => {
    db.all(`SELECT * FROM tasks`, (err, tasks) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(`SELECT * FROM task_steps`, (err, task_steps) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all(`SELECT * FROM email_log`, (err, email_log) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ tasks, task_steps, email_log });
            });
        });
    });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));