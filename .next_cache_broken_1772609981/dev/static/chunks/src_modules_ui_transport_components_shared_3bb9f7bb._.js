(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/modules/ui/transport/components/shared/live_countdown.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LiveCountdown",
    ()=>LiveCountdown
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
function formatCountdown(targetIso, now) {
    const diffMs = new Date(targetIso).getTime() - now;
    if (diffMs <= 0) {
        return {
            text: "00h 00m 00s",
            overdue: true
        };
    }
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    const paddedHours = String(hours).padStart(2, "0");
    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(seconds).padStart(2, "0");
    return {
        text: `${paddedHours}h ${paddedMinutes}m ${paddedSeconds}s`,
        overdue: false
    };
}
function LiveCountdown({ targetIso, prefix, overdueLabel = "Ended", className }) {
    _s();
    const [now, setNow] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "LiveCountdown.useState": ()=>Date.now()
    }["LiveCountdown.useState"]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "LiveCountdown.useEffect": ()=>{
            const intervalId = window.setInterval({
                "LiveCountdown.useEffect.intervalId": ()=>{
                    setNow(Date.now());
                }
            }["LiveCountdown.useEffect.intervalId"], 1000);
            return ({
                "LiveCountdown.useEffect": ()=>{
                    window.clearInterval(intervalId);
                }
            })["LiveCountdown.useEffect"];
        }
    }["LiveCountdown.useEffect"], []);
    const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "LiveCountdown.useMemo[value]": ()=>formatCountdown(targetIso, now)
    }["LiveCountdown.useMemo[value]"], [
        targetIso,
        now
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
        className: className,
        children: [
            prefix ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                children: [
                    prefix,
                    " "
                ]
            }, void 0, true, {
                fileName: "[project]/src/modules/ui/transport/components/shared/live_countdown.tsx",
                lineNumber: 56,
                columnNumber: 17
            }, this) : null,
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                children: value.overdue ? overdueLabel : value.text
            }, void 0, false, {
                fileName: "[project]/src/modules/ui/transport/components/shared/live_countdown.tsx",
                lineNumber: 57,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/modules/ui/transport/components/shared/live_countdown.tsx",
        lineNumber: 55,
        columnNumber: 5
    }, this);
}
_s(LiveCountdown, "gxrs6YjHEj335h+0iqOrvQk1vkc=");
_c = LiveCountdown;
var _c;
__turbopack_context__.k.register(_c, "LiveCountdown");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/modules/ui/transport/components/shared/market_shell.tsx [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

const e = new Error("Could not parse module '[project]/src/modules/ui/transport/components/shared/market_shell.tsx'\n\nUnexpected token. Did you mean `{'}'}` or `&rbrace;`?");
e.code = 'MODULE_UNPARSABLE';
throw e;
}),
]);

//# sourceMappingURL=src_modules_ui_transport_components_shared_3bb9f7bb._.js.map