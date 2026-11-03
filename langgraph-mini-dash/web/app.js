let cy;
let totalNodesCount = 0;
let completedNodesCount = 0;
let startTime = null;
let durationInterval = null;
let savedGraphData = null;
let runHistory = [];
let nodeStates = {};
let selectedNodeId = null;
let nodeStartTimes = {};
let nodeDurations = {};

let appSettings = {
    apiEndpoint: '/api/stream',
    autoScrollLogs: true,
};

const themeToggle = document.getElementById('theme-toggle');
const iconMoon = document.getElementById('icon-moon');
const iconSun  = document.getElementById('icon-sun');

function setTheme(isLight) {
    if (isLight) {
        document.body.classList.add('light-theme');
        if (iconMoon) iconMoon.style.display = 'none';
        if (iconSun) iconSun.style.display = 'block';
    } else {
        document.body.classList.remove('light-theme');
        if (iconMoon) iconMoon.style.display = 'block';
        if (iconSun) iconSun.style.display = 'none';
    }
}

const savedTheme = localStorage.getItem('dash_theme');
if (savedTheme === 'light') {
    setTheme(true);
} else {
    setTheme(false);
}

themeToggle.addEventListener('click', () => {
    const isCurrentlyLight = document.body.classList.contains('light-theme');
    const newLightState = !isCurrentlyLight;
    
    setTheme(newLightState);
    localStorage.setItem('dash_theme', newLightState ? 'light' : 'dark');
});

const tabGraph      = document.getElementById('tab-graph');
const tabFlow       = document.getElementById('tab-flow');
const cyContainer   = document.getElementById('cy-container');
const flowContainer = document.getElementById('flow-container');
const flowTimeline  = document.getElementById('flow-timeline');

tabGraph.addEventListener('click', () => {
    tabGraph.classList.add('active');
    tabFlow.classList.remove('active');
    cyContainer.style.display = 'block';
    flowContainer.style.display = 'none';
    if (cy) cy.resize();
});

tabFlow.addEventListener('click', () => {
    tabFlow.classList.add('active');
    tabGraph.classList.remove('active');
    cyContainer.style.display = 'none';
    flowContainer.style.display = 'block';
});

const navGraph    = document.getElementById('nav-graph');
const navRuns     = document.getElementById('nav-runs');
const navSettings = document.getElementById('nav-settings');
const sidebarTitle   = document.getElementById('sidebar-title');
const sidebarContent = document.getElementById('sidebar-content');

function setActiveNav(btn) {
    [navGraph, navRuns, navSettings].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

navGraph.addEventListener('click',    () => { setActiveNav(navGraph);    sidebarTitle.textContent = 'Nodes';       renderNodesPane(); });
navRuns.addEventListener('click',     () => { setActiveNav(navRuns);     sidebarTitle.textContent = 'Run History'; renderRunsPane(); });
navSettings.addEventListener('click', () => { setActiveNav(navSettings); sidebarTitle.textContent = 'Settings';    renderSettingsPane(); });

function renderNodesPane() {
    sidebarContent.innerHTML = '<div id="nodes-list"></div>';
    populateNodesSidebar(savedGraphData);
}

document.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('#toggle-filter-btn');
    if (filterBtn) {
        const searchContainer = document.getElementById('search-container');
        if (searchContainer) {
            const isHidden = searchContainer.style.display === 'none';
            searchContainer.style.display = isHidden ? 'block' : 'none';
            
            if (isHidden) {
                const input = document.getElementById('node-search-input');
                if (input) {
                    input.focus();
                }
            } else {
                clearSearchFilter();
            }
        }
    }
});

document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'node-search-input') {
        const query = e.target.value.toLowerCase();
        
        document.querySelectorAll('.node-item').forEach(item => {
            const name = item.querySelector('.node-name').textContent.toLowerCase();
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });

        if (cy) {
            if (!query) {
                cy.nodes().style('opacity', 1);
                cy.edges().style('opacity', 1);
            } else {
                cy.nodes().forEach(node => {
                    const label = (node.data('label') || node.data('id')).toLowerCase();
                    if (label.includes(query)) {
                        node.style('opacity', 1);
                    } else {
                        node.style('opacity', 0.25);
                    }
                });
            }
        }
    }
});

function clearSearchFilter() {
    const input = document.getElementById('node-search-input');
    if (input) input.value = '';
    document.querySelectorAll('.node-item').forEach(item => { item.style.display = 'flex'; });
    if (cy) {
        cy.nodes().style('opacity', 1);
        cy.edges().style('opacity', 1);
    }
}

function renderRunsPane() {
    if (runHistory.length === 0) {
        sidebarContent.innerHTML = '<div style="color:var(--text-dim);font-size:12.5px;padding:4px 2px;">No sessions yet.</div>';
        return;
    }
    sidebarContent.innerHTML = '';
    runHistory.forEach(run => {
        const item = document.createElement('div');
        item.className = 'run-history-item';
        item.innerHTML = `
            <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted)">${run.id}</span>
            <span style="color:var(--green);font-size:11px;">${run.time}</span>
        `;
        sidebarContent.appendChild(item);
    });
}

function renderSettingsPane() {
    sidebarContent.innerHTML = `
        <div class="settings-pane">
            <label>API Endpoint
                <input type="text" id="setting-endpoint" value="${appSettings.apiEndpoint}">
            </label>
            <label style="flex-direction:row;align-items:center;justify-content:space-between;">
                Auto-scroll logs
                <input type="checkbox" id="setting-autoscroll" ${appSettings.autoScrollLogs ? 'checked' : ''} style="width:auto;">
            </label>
        </div>
    `;
    document.getElementById('setting-endpoint').addEventListener('input', e => {
        appSettings.apiEndpoint = e.target.value;
    });
    document.getElementById('setting-autoscroll').addEventListener('change', e => {
        appSettings.autoScrollLogs = e.target.checked;
    });
}

function selectNode(id) {
    selectedNodeId = id;

    document.querySelectorAll('.node-item').forEach(el => el.classList.remove('selected'));
    const sidebarItem = document.getElementById(`sidebar-item-${id}`);
    if (sidebarItem) sidebarItem.classList.add('selected');

    const state  = nodeStates[id] || 'idle';
    const nodeEl = cy ? cy.getElementById(id) : null;
    const output = nodeEl ? (nodeEl.scratch('lastOutput') || '') : '';

    document.getElementById('node-detail-empty').style.display   = 'none';
    document.getElementById('node-detail-content').style.display = 'block';
    document.getElementById('detail-id').textContent = id;

    const statusEl = document.getElementById('detail-status');
    statusEl.textContent  = capitalize(state);
    statusEl.className    = 'val';
    if (state === 'active') statusEl.style.color = 'var(--accent)';
    else if (state === 'done') statusEl.style.color = 'var(--green)';
    else statusEl.style.color = 'var(--text-dim)';

    const outputEl = document.getElementById('detail-output');
    outputEl.textContent = output.trim() || 'No output yet';
}

function updateSelectedNodeDetail() {
    if (!selectedNodeId) return;
    selectNode(selectedNodeId);
}

fetch('/api/graph')
    .then(r => r.json())
    .then(graphData => {
        savedGraphData = graphData;

        cy = cytoscape({
            container: document.getElementById('cy'),
            elements: graphData,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#1e293b',
                        'border-width': 2,
                        'border-color': '#334155',
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': '#f0f0f5',
                        'width': 72,
                        'height': 72,
                        'shape': 'ellipse',
                        'font-size': '11.5px',
                        'font-weight': '600',
                        'font-family': 'Inter, system-ui, sans-serif',
                        'transition-property': 'background-color, border-color',
                        'transition-duration': '0.25s'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1.5,
                        'line-color': '#2d3748',
                        'target-arrow-color': '#2d3748',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 0.9
                    }
                },
                {
                    selector: '.active-node',
                    style: {
                        'background-color': '#1e3a8a',
                        'border-color': '#4f7dff',
                        'border-width': 3
                    }
                },
                {
                    selector: '.completed-node',
                    style: {
                        'background-color': '#14532d',
                        'border-color': '#22c55e',
                        'border-width': 2
                    }
                },
                {
                    selector: '.selected-node',
                    style: {
                        'border-width': 3,
                        'border-color': '#f0f0f5'
                    }
                }
            ],
            layout: {
                name: 'dagre',
                rankDir: 'TB',
                padding: 60,
                spacingFactor: 1.3,
                nodeSep: 50,
                rankSep: 80,
            }
        });

        cy.on('tap', 'node', function(evt) {
            const node = evt.target;
            const id   = node.data('id');

            cy.nodes().removeClass('selected-node');
            node.addClass('selected-node');

            selectNode(id);
        });

        cy.on('tap', function(evt) {
            if (evt.target === cy) {
                cy.nodes().removeClass('selected-node');
                selectedNodeId = null;
                document.querySelectorAll('.node-item').forEach(el => el.classList.remove('selected'));
                document.getElementById('node-detail-empty').style.display   = 'block';
                document.getElementById('node-detail-content').style.display = 'none';
            }
        });

        const tooltip = document.getElementById('cy-tooltip');

        cy.on('mouseover', 'node', function(evt) {
            const node  = evt.target;
            const data  = node.data();
            const state = nodeStates[data.id] || 'idle';

            tooltip.innerHTML = `
                <div class="tooltip-label">${escHtml(data.label || data.id)}</div>
                <div class="tooltip-status-row">
                    <span class="tooltip-status-dot ${state}"></span>
                    <span style="color:var(--text-muted)">${capitalize(state)}</span>
                </div>
                <div class="tooltip-hint">Click to inspect output</div>
            `;
            tooltip.style.display = 'block';
        });

        cy.on('mousemove', 'node', function(evt) {
            const oe   = evt.originalEvent;
            const rect = cy.container().getBoundingClientRect();
            let x = oe.clientX - rect.left + 14;
            let y = oe.clientY - rect.top  + 14;
            if (x + 220 > rect.width)  x = oe.clientX - rect.left - 234;
            if (y + 100 > rect.height) y = oe.clientY - rect.top  - 114;
            tooltip.style.left = `${x}px`;
            tooltip.style.top  = `${y}px`;
        });

        cy.on('mouseover', 'node', function(evt) {
            const node  = evt.target;
            const data  = node.data();
            const state = nodeStates[data.id] || 'idle';
            const duration = nodeDurations[data.id] ? ` (${nodeDurations[data.id]})` : '';

            tooltip.innerHTML = `
                <div class="tooltip-label">${escHtml(data.label || data.id)}${duration}</div>
                <div class="tooltip-status-row">
                    <span class="tooltip-status-dot ${state}"></span>
                    <span style="color:var(--text-muted)">${capitalize(state)} ${nodeDurations[data.id] ? '• ' + nodeDurations[data.id] : ''}</span>
                </div>
                <div class="tooltip-hint">Click to inspect output</div>
            `;
            tooltip.style.display = 'block';
        });

        cy.on('mouseout', 'node', () => { tooltip.style.display = 'none'; });

        populateNodesSidebar(graphData);
    });

let pulseInterval = null;

function startPulse(id) {
    stopPulse();
    const nodeEl = cy.getElementById(id);
    if (!nodeEl.length) return;

    const renderedPos  = nodeEl.renderedPosition();
    const renderedSize = nodeEl.renderedWidth();
    const container    = cy.container();

    const ring = document.createElement('div');
    ring.id = 'pulse-ring';
    ring.style.cssText = `
        position: absolute;
        border-radius: 50%;
        border: 2px solid #4f7dff;
        pointer-events: none;
        z-index: 4;
        animation: pulse-ring 1.2s ease-out infinite;
    `;

    function updateRingPos() {
        const pos  = nodeEl.renderedPosition();
        const size = nodeEl.renderedWidth();
        ring.style.left   = `${pos.x - size / 2 - 6}px`;
        ring.style.top    = `${pos.y - size / 2 - 6}px`;
        ring.style.width  = `${size + 12}px`;
        ring.style.height = `${size + 12}px`;
    }

    updateRingPos();
    container.appendChild(ring);
    pulseInterval = setInterval(updateRingPos, 100);
}

function stopPulse() {
    if (pulseInterval) { clearInterval(pulseInterval); pulseInterval = null; }
    const ring = document.getElementById('pulse-ring');
    if (ring) ring.remove();
}

function populateNodesSidebar(graphData) {
    const nodesList = document.getElementById('nodes-list');
    if (!nodesList) return;
    nodesList.innerHTML = '';

    const nodeList = Array.isArray(graphData)
        ? graphData.filter(item => item.data && !item.data.source)
        : (graphData ? graphData.nodes : null);
    if (!nodeList) return;

    totalNodesCount = nodeList.length;
    nodeList.forEach(node => {
        const id    = node.data.id;
        const label = node.data.label || id;
        const state = nodeStates[id] || 'idle';

        const item = document.createElement('div');
        item.className = 'node-item' + (selectedNodeId === id ? ' selected' : '');
        item.id = `sidebar-item-${id}`;
        item.innerHTML = `
            <div class="node-info">
                <span class="node-dot ${state}" id="dot-${id}"></span>
                <span class="node-name">${escHtml(label)}</span>
            </div>
            <span class="node-status-badge ${state}" id="badge-${id}">${state}</span>
        `;
        item.addEventListener('click', () => {
            if (cy) {
                cy.nodes().removeClass('selected-node');
                cy.getElementById(id).addClass('selected-node');
            }
            selectNode(id);
        });
        nodesList.appendChild(item);
    });
}

function setNodeState(id, state) {
    nodeStates[id] = state;
    const badge = document.getElementById(`badge-${id}`);
    const dot   = document.getElementById(`dot-${id}`);
    if (badge) { badge.className = `node-status-badge ${state}`; badge.textContent = state; }
    if (dot)   { dot.className   = `node-dot ${state}`; }

    if (state === 'active') startPulse(id);
    if (state === 'done' && cy) {
        const activePulseNode = cy.nodes('.active-node');
        if (activePulseNode.length === 0) stopPulse();
        else stopPulse();
    }

    if (selectedNodeId === id) updateSelectedNodeDetail();
}

async function readSSEStream(response, onMessage) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
            const dataLine = event
                .split('\n')
                .find(line => line.startsWith('data:'));

            if (!dataLine) continue;

            try {
                onMessage(JSON.parse(dataLine.slice(5).trim()));
            } catch (error) {
                console.error('Invalid SSE message:', error);
            }
        }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
        const dataLine = buffer
            .split('\n')
            .find(line => line.startsWith('data:'));

        if (dataLine) {
            try {
                onMessage(JSON.parse(dataLine.slice(5).trim()));
            } catch (error) {
                console.error('Invalid SSE message:', error);
            }
        }
    }
}

async function getGraphInputs() {
    const response = await fetch('/api/schemas');

    if (!response.ok) {
        throw new Error(`Failed to load schemas: ${response.status}`);
    }

    const schemas = await response.json();

    return showGraphInputForm(schemas.input);
}

function showGraphInputForm(schema) {
    return new Promise((resolve) => {
        const resolvedSchema = schema.$ref
            ? schema.$defs?.[schema.$ref.split('/').pop()] || schema
            : schema;

        const properties = resolvedSchema.properties || {};
        const required = resolvedSchema.required || [];

        const dialog = document.createElement('dialog');

        dialog.style.cssText = `
            width: min(480px, calc(100% - 32px));
            max-height: 85vh;
            padding: 24px;
            border: 1px solid var(--border-color, #26262e);
            border-radius: 12px;
            background: var(--bg-card, #17171b);
            color: var(--text-main, #f0f0f5);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            overflow-y: auto;
            animation: fadeIn 0.2s ease-out;
        `;

        const form = document.createElement('form');
        form.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 16px;
        `;

        const title = document.createElement('h2');
        title.textContent = schema.title || 'Workflow Input';
        title.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-main, #f0f0f5);
        `;

        const description = document.createElement('p');
        description.textContent = schema.description || 'Enter the input data for your workflow.';
        description.style.cssText = `
            margin: 0;
            color: var(--text-muted, #94a3b8);
            font-size: 12.5px;
            line-height: 1.4;
        `;

        form.append(title, description);

        const fields = [];

        for (const [name, originalSchema] of Object.entries(properties)) {
            let fieldSchema = originalSchema;

            if (fieldSchema.anyOf || fieldSchema.oneOf) {
                const variants = fieldSchema.anyOf || fieldSchema.oneOf;
                fieldSchema = variants.find(v => v.type !== 'null') || fieldSchema;
            }

            let type = fieldSchema.type;

            if (Array.isArray(type)) {
                type = type.find(t => t !== 'null') || 'string';
            }

            const label = document.createElement('label');
            label.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 6px;
                font-size: 12.5px;
                font-weight: 500;
                color: var(--text-muted, #94a3b8);
            `;

            const labelText = document.createElement('span');
            labelText.textContent = fieldSchema.title || name;
            labelText.style.color = 'var(--text-main, #f0f0f5)';

            if (required.includes(name)) {
                labelText.textContent += ' *';
            }

            label.appendChild(labelText);

            let input;

            if (type === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = fieldSchema.default ?? false;
            } else if (fieldSchema.enum) {
                input = document.createElement('select');
                fieldSchema.enum.forEach(option => {
                    const optionEl = document.createElement('option');
                    optionEl.value = String(option);
                    optionEl.textContent = String(option);
                    input.appendChild(optionEl);
                });
                if (fieldSchema.default !== undefined) {
                    input.value = String(fieldSchema.default);
                }
            } else if (type === 'integer' || type === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                input.step = type === 'integer' ? '1' : 'any';
                if (fieldSchema.minimum !== undefined) input.min = fieldSchema.minimum;
                if (fieldSchema.maximum !== undefined) input.max = fieldSchema.maximum;
                if (fieldSchema.default !== undefined) input.value = fieldSchema.default;
            } else if (type === 'object' || type === 'array') {
                input = document.createElement('textarea');
                input.rows = 4;
                input.value = JSON.stringify(fieldSchema.default ?? (type === 'array' ? [] : {}), null, 2);
                input.dataset.json = type;
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = fieldSchema.default ?? '';
            }

            input.name = name;
            input.style.cssText = `
                width: 100%;
                box-sizing: border-box;
                padding: 9px 12px;
                border: 1px solid var(--border-color, #26262e);
                border-radius: 6px;
                background: var(--bg-item, #1c1c21);
                color: var(--text-main, #f0f0f5);
                font: inherit;
                font-size: 13px;
                outline: none;
                transition: border-color 0.15s;
            `;

            input.addEventListener('focus', () => { input.style.borderColor = 'var(--accent, #4f7dff)'; });
            input.addEventListener('blur', () => { input.style.borderColor = 'var(--border-color, #26262e)'; });

            // Убираем жесткую обязательность (input.required = true), чтобы форма не ругалась на пустые поля

            if (fieldSchema.description) {
                const hint = document.createElement('small');
                hint.textContent = fieldSchema.description;
                hint.style.cssText = `
                    color: var(--text-dim, #4a4a58);
                    font-weight: 400;
                    font-size: 11px;
                `;
                label.appendChild(hint);
            }

            label.appendChild(input);
            form.appendChild(label);

            fields.push({ name, input, type });
        }

        const buttons = document.createElement('div');
        buttons.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 12px;
        `;

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = `
            padding: 8px 14px;
            border-radius: 6px;
            border: 1px solid var(--border-color, #26262e);
            background: var(--bg-item, #1c1c21);
            color: var(--text-muted, #94a3b8);
            cursor: pointer;
            font-weight: 500;
            font-size: 12.5px;
            font-family: inherit;
            transition: background 0.15s, color 0.15s;
        `;
        cancelButton.addEventListener('mouseover', () => { cancelButton.style.background = 'var(--nav-hover, #222228)'; cancelButton.style.color = 'var(--text-main)'; });
        cancelButton.addEventListener('mouseout', () => { cancelButton.style.background = 'var(--bg-item, #1c1c21)'; cancelButton.style.color = 'var(--text-muted, #94a3b8)'; });

        const runButton = document.createElement('button');
        runButton.type = 'submit';
        runButton.textContent = 'Run workflow';
        runButton.style.cssText = `
            padding: 8px 16px;
            border-radius: 6px;
            border: 1px solid var(--accent, #4f7dff);
            background: var(--accent, #4f7dff);
            color: #ffffff;
            cursor: pointer;
            font-weight: 600;
            font-size: 12.5px;
            font-family: inherit;
            transition: background 0.15s;
        `;
        runButton.addEventListener('mouseover', () => { runButton.style.background = '#3b6be8'; });
        runButton.addEventListener('mouseout', () => { runButton.style.background = 'var(--accent, #4f7dff)'; });

        cancelButton.addEventListener('click', () => {
            dialog.close();
        });

        buttons.append(cancelButton, runButton);
        form.appendChild(buttons);
        dialog.appendChild(form);
        document.body.appendChild(dialog);

        function cleanup(value) {
            dialog.close();
            dialog.remove();
            resolve(value);
        }

        dialog.addEventListener('close', () => {
            if (dialog.isConnected) {
                dialog.remove();
                resolve(null);
            }
        });

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const result = {};

            try {
                for (const field of fields) {
                    const { name, input, type } = field;

                    if (input.type === 'checkbox') {
                        result[name] = input.checked;
                    } else if (input.dataset.json) {
                        result[name] = input.value.trim() ? JSON.parse(input.value) : {};
                    } else if (type === 'number' || type === 'integer') {
                        result[name] = input.value === '' ? null : Number(input.value);
                    } else if (type === 'boolean') {
                        result[name] = input.checked;
                    } else {
                        const val = input.value.trim();
                        if (val !== '') {
                            result[name] = val;
                        }
                    }
                }

                cleanup(result);
            } catch (error) {
                alert(`Invalid input: ${error.message}`);
            }
        });

        dialog.showModal();
    });
}

const runSimulation = async () => {
    const currentEndpoint = appSettings.apiEndpoint;
    const consoleDiv = document.getElementById('console') || document.getElementById('console-output');

    let graphInputs;

    try {
        graphInputs = await getGraphInputs();

        if (graphInputs === null) {
            return;
        }
    } catch (error) {
        console.error(error);
        graphInputs = { text: "Default text" };
    }

    flowTimeline.innerHTML = '';

    cy.nodes().removeClass(
        'active-node completed-node selected-node'
    );

    cy.nodes().forEach(n => n.scratch('lastOutput', ''));

    stopPulse();

    nodeStates = {};
    nodeStartTimes = {};
    nodeDurations = {};
    selectedNodeId = null;

    document.getElementById('node-detail-empty').style.display = 'block';
    document.getElementById('node-detail-content').style.display = 'none';

    document.querySelectorAll('.node-status-badge').forEach(b => {
        b.className = 'node-status-badge idle';
        b.textContent = 'idle';
    });

    document.querySelectorAll('.node-dot').forEach(d => {
        d.className = 'node-dot';
    });

    document.querySelectorAll('.node-item').forEach(el => {
        el.classList.remove('selected');
    });

    completedNodesCount = 0;
    startTime = new Date();

    const runId = `#${startTime.getFullYear()}-${pad(startTime.getMonth() + 1)}-${pad(startTime.getDate())}-${Math.floor(100 + Math.random() * 900)}`;

    document.getElementById('info-run-id').textContent = runId;
    document.getElementById('info-status').innerHTML = '<span class="dot"></span> Running';
    document.getElementById('info-status').className = 'val running';
    document.getElementById('info-started').textContent = startTime.toTimeString().split(' ')[0];

    runHistory.unshift({
        id: runId,
        time: startTime.toTimeString().split(' ')[0]
    });

    if (durationInterval) {
        clearInterval(durationInterval);
    }

    durationInterval = setInterval(() => {
        const diff = Math.floor((Date.now() - startTime) / 1000);

        document.getElementById('info-duration').textContent =
            `${pad(Math.floor(diff / 3600))}:${pad(Math.floor(diff % 3600 / 60))}:${pad(diff % 60)}`;
    }, 1000);

    const statusBadgeIcon = document.getElementById('status-badge-icon');

    statusBadgeIcon.className = 'status-badge running';

    statusBadgeIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;

    document.getElementById('status-title').textContent = 'Workflow running';
    document.getElementById('status-subtitle').textContent = 'Processing nodes…';
    document.getElementById('progress-fill').style.width = '0%';

    const addFlowStep = (nodeName) => {
        const timeStr = new Date().toTimeString().split(' ')[0];

        const flowItem = document.createElement('div');
        flowItem.className = 'flow-item';

        flowItem.innerHTML = `
            <div class="flow-item-left">
                <span class="flow-item-dot"></span>
                <span class="flow-item-name">${escHtml(nodeName)}</span>
            </div>
            <span class="flow-item-time">${timeStr}</span>
        `;

        flowTimeline.appendChild(flowItem);
    };

    const startNode = cy.getElementById('__start__');

    if (startNode.length > 0) {
        startNode.addClass('completed-node');
        setNodeState('__start__', 'done');
        addFlowStep('__start__');

        completedNodesCount++;
        updateProgress();
    }

    try {
        const response = await fetch(
            `${currentEndpoint}?t=${Date.now()}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: graphInputs
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                `Server error: ${response.status} ${response.statusText}`
            );
        }

        let streamError = null;
        let streamFinished = false;

        await readSSEStream(response, data => {
            if (data.status === 'error') {
                streamError = new Error(
                    data.message || 'Workflow execution failed'
                );
                return;
            }

            if (data.status === 'finished') {
                streamFinished = true;
                return;
            }

            if (!data.node) return;

            const nodeEl = cy.getElementById(data.node);

            if (!nodeEl.length) return;

            if (data.status === 'active') {
                nodeStartTimes[data.node] = Date.now();

                nodeEl.addClass('active-node');
                setNodeState(data.node, 'active');

                consoleDiv.innerHTML +=
                    `[${new Date().toLocaleTimeString()}] node: ${data.node}\n`;
            }

            if (data.token) {
                consoleDiv.innerHTML += data.token;

                nodeEl.scratch(
                    'lastOutput',
                    (nodeEl.scratch('lastOutput') || '') + data.token
                );

                if (appSettings.autoScrollLogs) {
                    consoleDiv.scrollTop = consoleDiv.scrollHeight;
                }

                updateSelectedNodeDetail();
            }

            if (data.status === 'done') {
                if (nodeStartTimes[data.node]) {
                    const diffMs = Date.now() - nodeStartTimes[data.node];

                    nodeDurations[data.node] =
                        (diffMs / 1000).toFixed(2) + 's';
                }

                nodeEl.removeClass('active-node');
                nodeEl.addClass('completed-node');

                setNodeState(data.node, 'done');
                stopPulse();

                addFlowStep(data.node);

                completedNodesCount++;
                updateProgress();
            }
        });

        if (streamError) {
            throw streamError;
        }

        if (!streamFinished) {
            throw new Error('Stream closed before workflow finished');
        }

        if (durationInterval) {
            clearInterval(durationInterval);
        }

        stopPulse();

        const endNode = cy.getElementById('__end__');

        if (endNode.length > 0) {
            endNode.addClass('completed-node');
            setNodeState('__end__', 'done');
            addFlowStep('__end__');
        }

        document.getElementById('info-status').textContent = 'Completed';
        document.getElementById('info-status').className = 'val';

        statusBadgeIcon.className = 'status-badge success';

        document.getElementById('status-title').textContent =
            'Completed successfully';

        document.getElementById('status-subtitle').textContent =
            'All nodes processed';

        document.getElementById('progress-fill').style.width = '100%';

        consoleDiv.innerHTML +=
            `\n[${new Date().toLocaleTimeString()}] Workflow done.\n`;

        if (appSettings.autoScrollLogs) {
            consoleDiv.scrollTop = consoleDiv.scrollHeight;
        }

    } catch (error) {
        console.error(error);

        if (durationInterval) {
            clearInterval(durationInterval);
        }

        stopPulse();

        document.getElementById('info-status').textContent = 'Failed';
        document.getElementById('info-status').className = 'val';

        document.getElementById('status-title').textContent =
            'Workflow failed';

        document.getElementById('status-subtitle').textContent =
            error.message;

        statusBadgeIcon.className = 'status-badge error';

        consoleDiv.innerHTML +=
            `\n[ERROR] ${error.message}\n`;
    }
};

function updateProgress() {
    if (totalNodesCount > 0) {
        const pct = Math.min(Math.round((completedNodesCount / totalNodesCount) * 100), 100);
        document.getElementById('progress-fill').style.width = `${pct}%`;
    }
}

function pad(n) { return String(n).padStart(2, '0'); }

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

document.getElementById('run-btn').addEventListener('click', runSimulation);
document.getElementById('clear-logs').addEventListener('click', () => { document.getElementById('console').innerHTML = ''; });
document.getElementById('zoom-in').addEventListener('click',  () => cy.zoom(cy.zoom() * 1.2));
document.getElementById('zoom-out').addEventListener('click', () => cy.zoom(cy.zoom() / 1.2));
document.getElementById('zoom-fit').addEventListener('click', () => cy.fit());