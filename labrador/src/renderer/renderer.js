// ═══════════════════════════════════════════════════════════════════════════════
// Labrador — Renderer Process
// ═══════════════════════════════════════════════════════════════════════════════

(function () {
    "use strict";

    const api = window.labrador;

    // ── State ────────────────────────────────────────────────────────────────
    let currentSession = null;   // Full session object
    let currentSessionId = null; // Filename-safe id
    let uploadedFileData = null; // Uploaded file data for intake
    let selectedFormat = "docx";
    let selectedFormality = "formal";
    let generatedReportContent = null;
    let assistStreaming = false;

    // ── DOM References ───────────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const elSessionList = $("#session-list");
    const elPhaseIndicator = $("#phase-indicator");
    const elContentArea = $("#content-area");

    // Views
    const views = {
        welcome: $("#view-welcome"),
        intake: $("#view-intake"),
        loading: $("#view-loading"),
        session: $("#view-session"),
        report: $("#view-report")
    };

    // ── Toast Notifications ──────────────────────────────────────────────────
    function showToast(message, type) {
        type = type || "success";
        const container = $("#toast-container");
        const toast = document.createElement("div");
        toast.className = "toast " + type;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3200);
    }

    // ── View Management ──────────────────────────────────────────────────────
    function showView(name) {
        Object.keys(views).forEach(function (key) {
            if (key === name) {
                views[key].classList.remove("hidden");
            } else {
                views[key].classList.add("hidden");
            }
        });

        // Phase indicator visibility
        if (name === "welcome") {
            elPhaseIndicator.style.display = "none";
        } else {
            elPhaseIndicator.style.display = "flex";
        }

        // Assist FAB visibility — only in session phase
        var fab = $("#assist-fab");
        if (name === "session") {
            fab.classList.add("visible");
        } else {
            fab.classList.remove("visible");
            $("#assist-panel").classList.remove("visible");
        }
    }

    function updatePhaseIndicator(phase) {
        for (var i = 1; i <= 3; i++) {
            var step = $("#phase-step-" + i);
            var conn = i < 3 ? $("#phase-conn-" + i) : null;
            step.classList.remove("active", "completed");
            if (conn) conn.classList.remove("completed");

            if (i < phase) {
                step.classList.add("completed");
                if (conn) conn.classList.add("completed");
            } else if (i === phase) {
                step.classList.add("active");
            }
        }
    }

    // ── Session ID Generation ────────────────────────────────────────────────
    function generateSessionId(title) {
        var ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        var safe = (title || "experiment").replace(/[^a-z0-9]/gi, "-").slice(0, 40).toLowerCase();
        return ts + "-" + safe;
    }

    // ── Session List ─────────────────────────────────────────────────────────
    async function refreshSessionList() {
        var sessions = await api.listSessions();
        elSessionList.innerHTML = "";

        if (!sessions || sessions.length === 0) {
            elSessionList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:11px;">No sessions yet</div>';
            return;
        }

        sessions.forEach(function (s) {
            var item = document.createElement("div");
            item.className = "session-item" + (currentSessionId === s.sessionId ? " active" : "");
            item.dataset.sessionId = s.sessionId;

            var phaseClass = s.complete ? "complete" : "phase-" + s.phase;
            var phaseLabel = s.complete ? "Done" : "Phase " + s.phase;

            item.innerHTML =
                '<div class="session-title">' + escapeHtml(s.title) + '</div>' +
                '<div class="session-meta">' +
                    '<span class="phase-badge ' + phaseClass + '">' + phaseLabel + '</span>' +
                    '<span>' + formatDate(s.updatedAt) + '</span>' +
                '</div>' +
                '<button class="btn btn-danger session-delete" data-sid="' + s.sessionId + '">✕</button>';

            elSessionList.appendChild(item);
        });

        // Click handlers on items
        elSessionList.querySelectorAll(".session-item").forEach(function (el) {
            el.addEventListener("click", function (e) {
                if (e.target.classList.contains("session-delete")) return;
                loadSession(el.dataset.sessionId);
            });
        });

        // Delete handlers
        elSessionList.querySelectorAll(".session-delete").forEach(function (el) {
            el.addEventListener("click", async function (e) {
                e.stopPropagation();
                var sid = el.dataset.sid;
                if (confirm("Delete this session?")) {
                    await api.deleteSession(sid);
                    if (currentSessionId === sid) {
                        currentSession = null;
                        currentSessionId = null;
                        showView("welcome");
                    }
                    refreshSessionList();
                }
            });
        });
    }

    // ── Load Session ─────────────────────────────────────────────────────────
    async function loadSession(sessionId) {
        var data = await api.loadSession(sessionId);
        if (!data) {
            showToast("Session not found", "error");
            return;
        }
        currentSession = data;
        currentSessionId = sessionId;
        refreshSessionList();

        if (data.phase === 1 || !data.schema) {
            showPhase1();
        } else if (data.phase === 2) {
            showPhase2();
        } else if (data.phase === 3) {
            showPhase3();
        } else {
            showPhase2();
        }
    }

    // ── Save Current Session ─────────────────────────────────────────────────
    async function saveCurrentSession() {
        if (!currentSession || !currentSessionId) return;
        currentSession.updatedAt = new Date().toISOString();
        await api.saveSession(currentSessionId, currentSession);
        refreshSessionList();
    }

    // ── New Session ──────────────────────────────────────────────────────────
    function startNewSession() {
        currentSession = {
            title: "New Experiment",
            phase: 1,
            complete: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            schema: null,
            inputs: {},
            calculations: {},
            reportContent: null,
            reportFormat: null,
            reportFormality: null
        };
        currentSessionId = generateSessionId("new-experiment");
        uploadedFileData = null;
        showPhase1();
        saveCurrentSession();
        refreshSessionList();
    }

    // ── Phase 1: Intake ──────────────────────────────────────────────────────
    function showPhase1() {
        showView("intake");
        updatePhaseIndicator(1);

        // Reset intake form
        $("#procedure-text").value = "";
        $("#file-preview").classList.remove("visible");
        uploadedFileData = null;
    }

    // ── Phase 2: Guided Session ──────────────────────────────────────────────
    function showPhase2() {
        if (!currentSession || !currentSession.schema) {
            showToast("No experiment schema found", "error");
            return;
        }
        showView("session");
        updatePhaseIndicator(2);
        currentSession.phase = 2;
        saveCurrentSession();
        renderSessionForm();
    }

    function renderSessionForm() {
        var schema = currentSession.schema;

        $("#session-title").textContent = schema.title || "Experiment";
        $("#session-type").textContent = schema.type ? ("Type: " + schema.type) : "";
        $("#session-summary").textContent = schema.summary || "";

        // Known constants
        var constSection = $("#constants-section");
        var constGrid = $("#constants-grid");
        if (schema.knownConstants && schema.knownConstants.length > 0) {
            constGrid.innerHTML = "";
            schema.knownConstants.forEach(function (c) {
                var div = document.createElement("div");
                div.className = "constant-item";
                div.innerHTML =
                    '<span class="label">' + escapeHtml(c.label) + '</span>' +
                    '<span class="value">' + escapeHtml(String(c.value)) + (c.unit ? " " + escapeHtml(c.unit) : "") + '</span>';
                constGrid.appendChild(div);
            });
            constSection.style.display = "block";
        } else {
            constSection.style.display = "none";
        }

        // Required inputs — grouped
        var reqContainer = $("#required-inputs-container");
        reqContainer.innerHTML = "";

        var groups = {};
        (schema.requiredInputs || []).forEach(function (inp) {
            var grp = inp.group || "General";
            if (!groups[grp]) groups[grp] = [];
            groups[grp].push(inp);
        });

        Object.keys(groups).forEach(function (groupName) {
            var section = document.createElement("div");
            section.className = "input-group-section";
            section.innerHTML = '<h3>' + escapeHtml(groupName) + '</h3>';

            groups[groupName].forEach(function (inp) {
                section.appendChild(createFormField(inp, false));
            });

            reqContainer.appendChild(section);
        });

        // Calculations
        var calcSection = $("#calculations-section");
        var calcGrid = $("#calc-grid");
        if (schema.calculations && schema.calculations.length > 0) {
            calcGrid.innerHTML = "";
            schema.calculations.forEach(function (calc) {
                var div = document.createElement("div");
                div.className = "calc-item";
                div.id = "calc-" + calc.id;

                var storedVal = currentSession.calculations[calc.id];
                var displayVal = storedVal !== undefined && storedVal !== null
                    ? formatNumber(storedVal)
                    : null;

                div.innerHTML =
                    '<div class="calc-label">' + escapeHtml(calc.label) + '</div>' +
                    '<div class="calc-value' + (displayVal ? "" : " pending") + '" id="calc-val-' + calc.id + '">' +
                        (displayVal ? displayVal : "Waiting for inputs...") +
                    '</div>' +
                    (calc.unit ? '<span class="calc-unit">' + escapeHtml(calc.unit) + '</span>' : "");
                calcGrid.appendChild(div);
            });
            calcSection.style.display = "block";
        } else {
            calcSection.style.display = "none";
        }

        // Optional inputs
        var optContainer = $("#optional-inputs-container");
        optContainer.innerHTML = "";
        var optToggle = $("#optional-toggle");
        if (schema.optionalInputs && schema.optionalInputs.length > 0) {
            schema.optionalInputs.forEach(function (inp) {
                optContainer.appendChild(createFormField(inp, true));
            });
            optToggle.style.display = "block";
            optContainer.classList.remove("visible");
        } else {
            optToggle.style.display = "none";
        }

        // Run initial dependency check and calculations
        updateDependencies();
        runCalculations();
    }

    function createFormField(inp, isOptional) {
        var field = document.createElement("div");
        field.className = "form-field";
        field.id = "field-" + inp.id;
        field.dataset.inputId = inp.id;
        if (inp.dependsOn && inp.dependsOn.length > 0) {
            field.dataset.dependsOn = JSON.stringify(inp.dependsOn);
        }

        var labelHtml = escapeHtml(inp.label);
        if (inp.unit) labelHtml += ' <span class="unit">(' + escapeHtml(inp.unit) + ')</span>';
        if (isOptional) labelHtml += ' <span class="optional-tag">optional</span>';

        var inputHtml = "";
        var storedVal = currentSession.inputs[inp.id];
        var valAttr = storedVal !== undefined && storedVal !== null ? ' value="' + escapeHtml(String(storedVal)) + '"' : "";

        if (inp.dataType === "select" && inp.options) {
            inputHtml = '<select data-input-id="' + inp.id + '">';
            inputHtml += '<option value="">— Select —</option>';
            inp.options.forEach(function (opt) {
                var sel = storedVal === opt ? " selected" : "";
                inputHtml += '<option value="' + escapeHtml(opt) + '"' + sel + '>' + escapeHtml(opt) + '</option>';
            });
            inputHtml += '</select>';
        } else if (inp.dataType === "boolean") {
            inputHtml = '<select data-input-id="' + inp.id + '">';
            inputHtml += '<option value="">— Select —</option>';
            inputHtml += '<option value="yes"' + (storedVal === "yes" ? " selected" : "") + '>Yes</option>';
            inputHtml += '<option value="no"' + (storedVal === "no" ? " selected" : "") + '>No</option>';
            inputHtml += '</select>';
        } else if (inp.dataType === "number") {
            inputHtml = '<div class="input-row">' +
                '<input type="number" step="any" data-input-id="' + inp.id + '"' + valAttr + ' placeholder="Enter value" />' +
                (inp.unit ? '<span class="input-unit">' + escapeHtml(inp.unit) + '</span>' : "") +
                '</div>';
        } else {
            inputHtml = '<input type="text" data-input-id="' + inp.id + '"' + valAttr + ' placeholder="Enter value" />';
        }

        field.innerHTML =
            '<label>' + labelHtml + '</label>' +
            inputHtml +
            '<div class="validation-warning" id="warning-' + inp.id + '">⚠ <span></span></div>';

        // Attach input event listener
        var inputEl = field.querySelector("[data-input-id]");
        if (inputEl) {
            inputEl.addEventListener("input", function () {
                onInputChange(inp, inputEl);
            });
            inputEl.addEventListener("change", function () {
                onInputChange(inp, inputEl);
            });
            // Debounced validation
            var validateTimeout = null;
            inputEl.addEventListener("blur", function () {
                clearTimeout(validateTimeout);
                var val = inputEl.value.trim();
                if (val && inp.dataType === "number") {
                    validateTimeout = setTimeout(function () {
                        validateInput(inp, val);
                    }, 500);
                }
            });
        }

        return field;
    }

    function onInputChange(inp, inputEl) {
        var val = inputEl.value.trim();
        if (inp.dataType === "number" && val !== "") {
            var num = parseFloat(val);
            currentSession.inputs[inp.id] = isNaN(num) ? val : num;
        } else {
            currentSession.inputs[inp.id] = val || undefined;
        }
        updateDependencies();
        runCalculations();
        debouncedSave();
    }

    var saveTimeout = null;
    function debouncedSave() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(function () {
            saveCurrentSession();
        }, 1000);
    }

    function updateDependencies() {
        $$(".form-field[data-depends-on]").forEach(function (field) {
            var deps = JSON.parse(field.dataset.dependsOn);
            var allMet = deps.every(function (depId) {
                var val = currentSession.inputs[depId];
                return val !== undefined && val !== null && val !== "";
            });
            if (allMet) {
                field.classList.remove("hidden");
            } else {
                field.classList.add("hidden");
            }
        });
    }

    function runCalculations() {
        if (!currentSession || !currentSession.schema || !currentSession.schema.calculations) return;

        currentSession.schema.calculations.forEach(function (calc) {
            var canCalc = (calc.dependsOn || []).every(function (depId) {
                // Check inputs first, then constants
                var inVal = currentSession.inputs[depId];
                if (inVal !== undefined && inVal !== null && inVal !== "") return true;
                var constant = (currentSession.schema.knownConstants || []).find(function (c) { return c.id === depId; });
                if (constant && constant.value !== undefined) return true;
                return false;
            });

            var valEl = document.getElementById("calc-val-" + calc.id);
            if (!valEl) return;

            if (canCalc) {
                try {
                    var result = evaluateFormula(calc.formula, calc.dependsOn);
                    if (result !== null && !isNaN(result) && isFinite(result)) {
                        currentSession.calculations[calc.id] = result;
                        valEl.textContent = formatNumber(result);
                        valEl.classList.remove("pending");
                    } else {
                        valEl.textContent = "Error in calculation";
                        valEl.classList.add("pending");
                    }
                } catch (e) {
                    valEl.textContent = "Error: " + e.message;
                    valEl.classList.add("pending");
                }
            } else {
                valEl.textContent = "Waiting for inputs...";
                valEl.classList.add("pending");
                delete currentSession.calculations[calc.id];
            }
        });
    }

    function evaluateFormula(formula, depIds) {
        // Build variable map from inputs and constants
        var vars = {};

        // Inputs
        Object.keys(currentSession.inputs).forEach(function (key) {
            var val = currentSession.inputs[key];
            if (typeof val === "number") vars[key] = val;
            else if (typeof val === "string" && !isNaN(parseFloat(val))) vars[key] = parseFloat(val);
        });

        // Constants
        (currentSession.schema.knownConstants || []).forEach(function (c) {
            var val = c.value;
            if (typeof val === "number") vars[c.id] = val;
            else if (typeof val === "string" && !isNaN(parseFloat(val))) vars[c.id] = parseFloat(val);
        });

        // Other calculated values (for chained calculations)
        Object.keys(currentSession.calculations).forEach(function (key) {
            if (typeof currentSession.calculations[key] === "number") {
                vars[key] = currentSession.calculations[key];
            }
        });

        // Build a function with named parameters
        var varNames = Object.keys(vars);
        var varValues = varNames.map(function (k) { return vars[k]; });

        // Sanitize: only allow Math, numbers, operators, and known variable names
        // For v0.1, we use Function constructor with the variable scope
        var fn = new Function(varNames.join(","), "return (" + formula + ");");
        return fn.apply(null, varValues);
    }

    async function validateInput(inp, value) {
        if (!currentSession) return;
        try {
            var result = await api.validateValue(
                inp.label,
                value,
                inp.unit,
                {
                    title: currentSession.schema.title,
                    type: currentSession.schema.type,
                    knownConstants: currentSession.schema.knownConstants
                }
            );
            var warnEl = document.getElementById("warning-" + inp.id);
            if (warnEl && result && !result.ok && result.warning) {
                warnEl.querySelector("span").textContent = result.warning;
                warnEl.classList.add("visible");
            } else if (warnEl) {
                warnEl.classList.remove("visible");
            }
        } catch (e) {
            // Silently fail validation
        }
    }

    // ── Phase 3: Report ──────────────────────────────────────────────────────
    function showPhase3() {
        showView("report");
        updatePhaseIndicator(3);
        currentSession.phase = 3;
        saveCurrentSession();

        // Reset
        generatedReportContent = null;
        $("#report-preview").classList.remove("visible");
        $("#report-preview").textContent = "";
        $("#report-actions-bottom").classList.add("hidden");
    }

    async function generateReport() {
        if (!currentSession || !currentSession.schema) return;

        showView("loading");
        $("#loading-text").textContent = "Generating " + selectedFormality + " " + selectedFormat + " report with Claude...";

        try {
            var sessionData = {
                title: currentSession.schema.title,
                type: currentSession.schema.type,
                summary: currentSession.schema.summary,
                knownConstants: currentSession.schema.knownConstants,
                inputs: currentSession.inputs,
                calculations: currentSession.calculations,
                requiredInputs: currentSession.schema.requiredInputs,
                optionalInputs: currentSession.schema.optionalInputs,
                calculationDefinitions: currentSession.schema.calculations
            };

            var content = await api.generateReport(sessionData, selectedFormat, selectedFormality);
            generatedReportContent = content;

            currentSession.reportContent = content;
            currentSession.reportFormat = selectedFormat;
            currentSession.reportFormality = selectedFormality;
            saveCurrentSession();

            showView("report");
            updatePhaseIndicator(3);
            $("#report-preview").textContent = content;
            $("#report-preview").classList.add("visible");
            $("#report-actions-bottom").classList.remove("hidden");
            showToast("Report generated successfully");
        } catch (e) {
            showView("report");
            updatePhaseIndicator(3);
            showToast("Error: " + e.message, "error");
        }
    }

    async function exportReport() {
        if (!generatedReportContent) {
            showToast("No report to export", "error");
            return;
        }

        var safeName = (currentSession.schema.title || "report").replace(/[^a-z0-9]/gi, "-").toLowerCase();
        var result = null;

        try {
            switch (selectedFormat) {
                case "docx":
                    result = await api.exportDocx(generatedReportContent, safeName + ".docx");
                    break;
                case "latex":
                    result = await api.exportLatex(generatedReportContent, safeName + ".tex");
                    break;
                case "pdf":
                    result = await api.exportPdf(generatedReportContent, safeName + ".pdf");
                    break;
                case "xlsx":
                    result = await api.exportXlsx(generatedReportContent, safeName + ".xlsx");
                    break;
                case "markdown":
                    result = await api.exportMarkdown(generatedReportContent, safeName + ".md");
                    break;
            }

            if (result) {
                currentSession.complete = true;
                saveCurrentSession();
                showToast("Exported to: " + result);
            }
        } catch (e) {
            showToast("Export error: " + e.message, "error");
        }
    }

    // ── Assist Panel ─────────────────────────────────────────────────────────
    function toggleAssist() {
        var panel = $("#assist-panel");
        var fab = $("#assist-fab");
        if (panel.classList.contains("visible")) {
            panel.classList.remove("visible");
            fab.classList.add("visible");
        } else {
            panel.classList.add("visible");
            fab.classList.remove("visible");
            $("#assist-input").focus();
        }
    }

    async function sendAssist() {
        if (assistStreaming) return;
        var input = $("#assist-input");
        var question = input.value.trim();
        if (!question) return;

        input.value = "";
        assistStreaming = true;

        var body = $("#assist-body");
        body.innerHTML += '<div style="margin-top:12px;padding:8px;background:var(--bg-active);border-radius:4px;"><strong>You:</strong> ' + escapeHtml(question) + '</div>';
        body.innerHTML += '<div id="assist-response" style="margin-top:8px;"></div>';
        body.scrollTop = body.scrollHeight;

        var responseEl = document.getElementById("assist-response");
        var responseText = "";

        api.removeAssistListeners();

        api.onAssistChunk(function (text) {
            responseText += text;
            responseEl.innerHTML = renderSimpleMarkdown(responseText);
            body.scrollTop = body.scrollHeight;
        });

        api.onAssistDone(function () {
            assistStreaming = false;
            api.removeAssistListeners();
        });

        api.onAssistError(function (err) {
            assistStreaming = false;
            responseEl.innerHTML = '<span style="color:var(--error);">Error: ' + escapeHtml(err) + '</span>';
            api.removeAssistListeners();
        });

        var sessionContext = {
            title: currentSession.schema ? currentSession.schema.title : "",
            type: currentSession.schema ? currentSession.schema.type : "",
            summary: currentSession.schema ? currentSession.schema.summary : "",
            knownConstants: currentSession.schema ? currentSession.schema.knownConstants : [],
            currentInputs: currentSession.inputs,
            currentCalculations: currentSession.calculations
        };

        try {
            await api.inlineAssist(question, sessionContext);
        } catch (e) {
            assistStreaming = false;
            responseEl.innerHTML = '<span style="color:var(--error);">Error: ' + escapeHtml(String(e)) + '</span>';
        }
    }

    // ── Utility Functions ────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatDate(isoStr) {
        if (!isoStr) return "";
        try {
            var d = new Date(isoStr);
            var month = d.toLocaleString("default", { month: "short" });
            var day = d.getDate();
            var hour = d.getHours().toString().padStart(2, "0");
            var min = d.getMinutes().toString().padStart(2, "0");
            return month + " " + day + ", " + hour + ":" + min;
        } catch (e) {
            return isoStr.slice(0, 10);
        }
    }

    function formatNumber(n) {
        if (typeof n !== "number") return String(n);
        // Use appropriate significant figures
        if (Math.abs(n) >= 1000) return n.toFixed(1);
        if (Math.abs(n) >= 1) return n.toFixed(4);
        if (Math.abs(n) >= 0.001) return n.toFixed(6);
        return n.toExponential(4);
    }

    function renderSimpleMarkdown(text) {
        // Very minimal markdown rendering for the assist panel
        var html = escapeHtml(text);
        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        // Italic
        html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-primary);padding:1px 4px;border-radius:3px;font-family:var(--font-mono);font-size:11px;">$1</code>');
        // Line breaks
        html = html.replace(/\n/g, "<br>");
        return html;
    }

    // ── Event Listeners ──────────────────────────────────────────────────────

    // New session buttons
    $("#btn-new-session").addEventListener("click", startNewSession);
    $("#btn-welcome-new").addEventListener("click", startNewSession);

    // Settings
    $("#btn-settings").addEventListener("click", async function () {
        var key = await api.getApiKey();
        $("#input-api-key").value = key || "";
        $("#modal-settings").classList.add("visible");
    });

    $("#btn-settings-cancel").addEventListener("click", function () {
        $("#modal-settings").classList.remove("visible");
    });

    $("#btn-settings-save").addEventListener("click", async function () {
        var key = $("#input-api-key").value.trim();
        if (!key) {
            showToast("Please enter a valid API key", "error");
            return;
        }
        try {
            await api.setApiKey(key);
            $("#modal-settings").classList.remove("visible");
            showToast("API key saved successfully");
        } catch (e) {
            showToast("Error saving key: " + e.message, "error");
        }
    });

    // Close modal on overlay click
    $("#modal-settings").addEventListener("click", function (e) {
        if (e.target === $("#modal-settings")) {
            $("#modal-settings").classList.remove("visible");
        }
    });

    // Upload zone
    $("#upload-zone").addEventListener("click", async function () {
        var result = await api.uploadProcedureFile();
        if (result) {
            uploadedFileData = result;
            $("#file-name").textContent = result.fileName;
            $("#file-preview").classList.add("visible");
            $("#upload-zone").style.display = "none";
        }
    });

    // Remove uploaded file
    $("#file-remove").addEventListener("click", function () {
        uploadedFileData = null;
        $("#file-preview").classList.remove("visible");
        $("#upload-zone").style.display = "block";
    });

    // Intake cancel
    $("#btn-intake-cancel").addEventListener("click", function () {
        if (currentSession && !currentSession.schema) {
            // Session was just created, delete it
            api.deleteSession(currentSessionId);
            currentSession = null;
            currentSessionId = null;
            refreshSessionList();
        }
        showView("welcome");
    });

    // Intake parse
    $("#btn-intake-parse").addEventListener("click", async function () {
        var textVal = $("#procedure-text").value.trim();

        if (!uploadedFileData && !textVal) {
            showToast("Please upload a file or enter a procedure description", "warning");
            return;
        }

        showView("loading");
        updatePhaseIndicator(1);
        $("#loading-text").textContent = "Analyzing procedure with Claude...";

        try {
            var schema = await api.parseProcedure(textVal || null, uploadedFileData || null);

            currentSession.schema = schema;
            currentSession.title = schema.title || "Experiment";
            currentSession.phase = 2;
            currentSession.inputs = currentSession.inputs || {};
            currentSession.calculations = currentSession.calculations || {};

            // Update session ID if title changed
            var newId = generateSessionId(schema.title);
            await api.deleteSession(currentSessionId);
            currentSessionId = newId;
            await saveCurrentSession();
            refreshSessionList();

            showToast("Procedure parsed — " + (schema.requiredInputs || []).length + " inputs identified");
            showPhase2();
        } catch (e) {
            showView("intake");
            updatePhaseIndicator(1);
            showToast("Parse error: " + e.message, "error");
        }
    });

    // Back to intake from session
    $("#btn-back-intake").addEventListener("click", function () {
        currentSession.phase = 1;
        saveCurrentSession();
        showPhase1();
    });

    // Proceed to report
    $("#btn-proceed-report").addEventListener("click", function () {
        // Check if at least some inputs are filled
        var filledCount = Object.keys(currentSession.inputs).filter(function (k) {
            var v = currentSession.inputs[k];
            return v !== undefined && v !== null && v !== "";
        }).length;

        if (filledCount === 0) {
            showToast("Please enter at least some data before generating a report", "warning");
            return;
        }
        showPhase3();
    });

    // Format card selection
    $$("#format-cards .option-card").forEach(function (card) {
        card.addEventListener("click", function () {
            $$("#format-cards .option-card").forEach(function (c) { c.classList.remove("selected"); });
            card.classList.add("selected");
            selectedFormat = card.dataset.format;
        });
    });

    // Formality card selection
    $$("#formality-cards .option-card").forEach(function (card) {
        card.addEventListener("click", function () {
            $$("#formality-cards .option-card").forEach(function (c) { c.classList.remove("selected"); });
            card.classList.add("selected");
            selectedFormality = card.dataset.formality;
        });
    });

    // Generate report
    $("#btn-generate-report").addEventListener("click", generateReport);
    $("#btn-regenerate-report").addEventListener("click", generateReport);

    // Export report
    $("#btn-export-report").addEventListener("click", exportReport);

    // Back to session from report
    $("#btn-back-session").addEventListener("click", function () {
        currentSession.phase = 2;
        saveCurrentSession();
        showPhase2();
    });
    $("#btn-back-session-2").addEventListener("click", function () {
        currentSession.phase = 2;
        saveCurrentSession();
        showPhase2();
    });

    // Toggle optional inputs
    $("#btn-toggle-optional").addEventListener("click", function () {
        var container = $("#optional-inputs-container");
        var btn = $("#btn-toggle-optional");
        if (container.classList.contains("visible")) {
            container.classList.remove("visible");
            btn.textContent = "Show Optional Fields ▾";
        } else {
            container.classList.add("visible");
            btn.textContent = "Hide Optional Fields ▴";
        }
    });

    // Assist panel
    $("#assist-fab").addEventListener("click", toggleAssist);
    $("#assist-close").addEventListener("click", toggleAssist);
    $("#assist-send").addEventListener("click", sendAssist);
    $("#assist-input").addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendAssist();
        }
    });

    // ── Initialization ───────────────────────────────────────────────────────
    async function init() {
        await refreshSessionList();

        // Check for API key
        var key = await api.getApiKey();
        if (!key) {
            // Show settings modal on first launch
            setTimeout(function () {
                $("#modal-settings").classList.add("visible");
                showToast("Welcome! Please enter your Anthropic API key to get started.", "warning");
            }, 500);
        }

        // Try to resume most recent incomplete session
        var sessions = await api.listSessions();
        if (sessions && sessions.length > 0) {
            var incomplete = sessions.find(function (s) { return !s.complete; });
            if (incomplete) {
                await loadSession(incomplete.sessionId);
                return;
            }
        }

        showView("welcome");
    }

    init();

})();
