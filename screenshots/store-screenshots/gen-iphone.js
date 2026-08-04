/* Semora — App Store iPhone screenshots (1284x2778, 6.7"). "Aurora Command
   Center": warm-LIGHT aurora field (not sad flat purple), dark editorial
   Fraunces headlines with one violet word, tilted photoreal iPhone showing the
   REAL cream app UI, and layered glass "smart proof" chips. 6-screen story:
   Scan -> Today -> Grades -> Canvas auto-sync (hero) -> Calendar -> Pro.
   Render: chrome-headless-shell, window 642x1389 @2x -> 1284x2778. */
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/smile/Desktop/semora';
const FR = (w) => `file://${ROOT}/node_modules/@expo-google-fonts/fraunces/${w}`;
const FA = `file://${ROOT}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf`;
const OUT = path.join(ROOT, 'store-screenshots', 'iphone');
fs.mkdirSync(OUT, { recursive: true });

const I = {
  bolt: '&#xf0e7;', camera: '&#xf030;', filepdf: '&#xf1c1;', image: '&#xf03e;',
  folder: '&#xf115;', chev: '&#xf054;', chevL: '&#xf053;', check: '&#xf00c;',
  flag: '&#xf024;', sun: '&#xf185;', book: '&#xf02d;', calendar: '&#xf073;',
  user: '&#xf007;', star: '&#xf005;', linechart: '&#xf201;', bell: '&#xf0f3;',
  caret: '&#xf0d7;', cog: '&#xf013;', qcircle: '&#xf059;', starO: '&#xf006;',
  clock: '&#xf017;', mapmarker: '&#xf041;', plus: '&#xf067;', pencil: '&#xf040;',
  trash: '&#xf1f8;', magic: '&#xf0d0;', graduation: '&#xf19d;', shield: '&#xf132;',
  refresh: '&#xf021;', unlink: '&#xf127;', blacktie: '&#xf27e;', circleo: '&#xf10c;',
};

const SBAR = `<div class="sbar"><span class="t">9:41</span><span class="r">
<svg width="18" height="12" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" fill="#1C1B1F"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="#1C1B1F"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="#1C1B1F"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="#1C1B1F"/></svg>
<svg width="17" height="12" viewBox="0 0 16 12"><path fill="#1C1B1F" d="M8 2.6c2.5 0 4.8 1 6.5 2.6l-1.4 1.5C11.8 5.4 10 4.6 8 4.6S4.2 5.4 2.9 6.7L1.5 5.2C3.2 3.6 5.5 2.6 8 2.6zM8 6.4c1.4 0 2.7.6 3.7 1.5l-1.5 1.6C9.6 9 8.8 8.6 8 8.6s-1.6.4-2.2 .9L4.3 7.9C5.3 7 6.6 6.4 8 6.4zM8 9.9l1.6 1.7c-.4 .4-1 .4-1.3 0L8 9.9z"/></svg>
<svg width="26" height="13" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="#1C1B1F" stroke-opacity="0.4"/><rect x="2" y="2" width="17" height="8" rx="1.5" fill="#1C1B1F"/><rect x="22.5" y="3.5" width="1.8" height="5" rx="0.9" fill="#1C1B1F" fill-opacity="0.5"/></svg>
</span></div>`;

const tab = (active) => {
  const it = (key, icon, label) =>
    `<div class="tab ${active === key ? 'active' : ''}"><div class="iw"><i class="fa">${icon}</i></div><div class="lbl">${label}</div></div>`;
  return `<div class="tabbar">
    ${it('today', I.sun, 'Today')}${it('courses', I.book, 'Courses')}
    <div class="tab scan"><div class="fab"><i class="fa">${I.camera}</i></div><div class="lbl">Scan</div></div>
    ${it('calendar', I.calendar, 'Calendar')}${it('me', I.user, 'Me')}
  </div>`;
};

const action = (cls, icon, title, sub) =>
  `<div class="actionCard"><div class="actionIcon ic-${cls}"><i class="fa">${icon}</i></div>
   <div style="flex:1"><div class="actionTitle">${title}</div><div class="actionSub">${sub}</div></div>
   <i class="fa chev">${I.chev}</i></div>`;

// ---------- 1. SCAN ----------
const scanApp = `<div class="app">${SBAR}
  <div class="appbody" style="padding:20px 22px 0">
    <div class="h1">Scan syllabus</div>
    <div class="sub2">Snap it, upload it, or drag it in.<br>We'll pull every deadline.</div>
    <div class="scanframe">
      <div class="corners">
        <span class="cn tl"></span><span class="cn tr"></span><span class="cn bl"></span><span class="cn br"></span>
        <div class="docmock"><div class="ml" style="width:60%"></div><div class="ml" style="width:82%"></div><div class="ml" style="width:46%"></div><div class="ml" style="width:72%;margin-top:9px"></div><div class="ml" style="width:60%"></div><div class="ml" style="width:78%"></div></div>
        <div class="scanline"></div>
      </div>
      <div class="framelabel">PDF &amp; PHOTO SUPPORTED</div>
    </div>
    <div class="actions">
      ${action('brand', I.camera, 'Take a photo', 'Printed handout or whiteboard')}
      ${action('coral', I.filepdf, 'Upload PDF', 'Email attachment or download')}
      ${action('teal', I.image, 'Choose from Photos', 'Select from your photo library')}
      ${action('blue', I.folder, 'Pick from Files', 'iCloud Drive, Google Drive…')}
    </div>
  </div>
  ${tab('scan')}</div>`;

// ---------- 2. TODAY ----------
const todayApp = `<div class="app">${SBAR}
  <div class="appbody" style="padding:18px 22px 0">
    <div class="eyelabel">WEDNESDAY · SEPTEMBER 9</div>
    <div class="greeting">Hey, Rajesh</div>
    <div class="semlabel">Fall 2026</div>
    <div class="hero">
      <div class="herotop"><span class="heroeye">NEXT UP</span><span class="herobadge">TODAY</span></div>
      <div class="herotitle">Calc II · Problem Set 7</div>
      <div class="herosub">Today · 23:59</div>
    </div>
    <div class="secrow"><span class="sectitle coral">Overdue · 1</span></div>
    <div class="overdueCard">
      <div class="overdueRow"><span class="cbx cbx-coral"></span>
        <div style="flex:1"><div class="taskTitle">Lab Report 3</div>
          <div class="taskmeta"><span class="dot" style="background:#10b981"></span><span class="taskcourse coral">Biology 101 · Sep 7</span></div></div>
        <span class="odbadge">2d late</span></div>
    </div>
    <div class="secrow"><span class="sectitle">Today · 1 of 2 done</span></div>
    <div class="progressTrack"><div class="progressFill" style="width:50%"></div></div>
    <div class="card">
      <div class="taskRow"><span class="cbx cbx-done"><i class="fa">${I.check}</i></span>
        <div style="flex:1"><div class="taskTitle done">Reading: Chapter 5</div>
          <div class="taskmeta"><span class="dot" style="background:#f59e0b"></span><span class="taskcourse">History 210</span></div></div></div>
      <div class="taskRow rowborder"><span class="cbx" style="border-color:#D85A30"></span>
        <div style="flex:1"><div class="taskTitle">Essay Outline</div>
          <div class="taskmeta"><span class="dot" style="background:#f59e0b"></span><span class="taskcourse coral">History 210 · due 17:00</span></div></div></div>
    </div>
    <div class="secrow"><span class="sectitle">This week</span></div>
    <div class="weekCard">
      <div class="weekStats">
        <div class="ws"><div class="wsNum" style="color:#6B46C1">6</div><div class="wsLbl">TASKS</div></div>
        <div class="ws"><div class="wsNum">1</div><div class="wsLbl">EXAMS</div></div>
        <div class="ws"><div class="wsNum" style="color:#D85A30">1</div><div class="wsLbl">OVERDUE</div></div>
        <div class="ws"><div class="wsNum">4</div><div class="wsLbl">COURSES</div></div>
      </div>
      <div class="weekBars">
        <div class="wb"><div class="wbTrack"><div class="wbFill" style="height:20%"></div></div><div class="wbDay">M</div></div>
        <div class="wb"><div class="wbTrack"><div class="wbFill" style="height:42%"></div></div><div class="wbDay">T</div></div>
        <div class="wb"><div class="wbTrack"><div class="wbFill" style="height:14%"></div></div><div class="wbDay">W</div></div>
        <div class="wb"><div class="wbTrack"><div class="wbFill" style="height:56%"></div></div><div class="wbDay">T</div></div>
        <div class="wb"><div class="wbTrack"><div class="wbFill" style="height:82%"></div></div><div class="wbDay">F</div></div>
        <div class="wb"><div class="wbTrack"><div class="wbFill" style="height:30%"></div></div><div class="wbDay">S</div></div>
        <div class="wb"><div class="wbTrack"><div class="wbFill hot" style="height:66%"></div></div><div class="wbDay">S</div></div>
      </div>
    </div>
  </div>
  ${tab('today')}</div>`;

// ---------- 3. COURSE / GRADES ----------
const courseApp = `<div class="app">${SBAR}
  <div class="navbar"><span class="navback"><i class="fa">${I.chevL}</i> Back</span><span class="navtitle">Course</span><span style="width:52px"></span></div>
  <div class="appbody" style="padding:6px 22px 0">
    <div class="courseHead">
      <div class="courseIcon"><i class="fa">${I.book}</i></div>
      <div style="flex:1"><div class="courseName">Calc II</div><div class="courseInstr">Dr. Rivera</div></div>
      <div class="courseCounts"><span style="color:#BA7517;font-weight:700">3 pending</span><span class="cdotsep">·</span><span style="color:#0F6E56;font-weight:700">5 done</span></div>
    </div>
    <div class="metaCard">
      <div class="metaRow"><i class="fa metaIc">${I.clock}</i><div style="flex:1"><div class="metaT">Class Meeting</div><div class="metaS">Mon · Wed · Fri, 10:00–10:50</div></div></div>
      <div class="metaRow rowborder"><i class="fa metaIc">${I.mapmarker}</i><div style="flex:1"><div class="metaT">Office Hours</div><div class="metaS">Tue 2:00–4:00 · Bldg 4, Rm 210</div></div></div>
    </div>
    <div class="gradeCard">
      <div class="gradeTop">
        <div><div class="gradeLbl">CURRENT GRADE</div><div class="gradePct">86.67%</div></div>
        <div class="gradeBadge">B</div>
      </div>
      <div class="gradeBarBg"><div class="gradeBarFill" style="width:86.67%"></div></div>
      <div class="gradeMeta"><span>3 of 5 graded</span><span class="gradeMetaR">45% of 60% attempted</span></div>
      <div class="gradeCtx">Based on 45% of coursework completed. Looking good!</div>
      <div class="whatif"><div class="whatifHead"><span class="whatifTitle">What do I need for an A?</span><span class="proPill">PRO</span></div>
        <div class="whatifSub">See the exact average you need on your remaining 15% — computed from this course's real weights.</div></div>
    </div>
    <div class="secrow" style="margin:15px 0 9px"><span class="sectitle">Assignments</span></div>
    <div class="card">
      <div class="taskRow"><span class="cbx cbx-done"><i class="fa">${I.check}</i></span>
        <div style="flex:1"><div class="taskTitle done">Midterm 1</div>
          <div class="taskmeta"><span class="taskcourse">Graded · worth 20%</span></div></div>
        <span class="scoreTag">88%</span></div>
      <div class="taskRow rowborder"><span class="cbx" style="border-color:#6366f1"></span>
        <div style="flex:1"><div class="taskTitle">Problem Set 7</div>
          <div class="taskmeta"><span class="taskcourse coral">Due today · 23:59</span></div></div></div>
    </div>
  </div>
  <div class="courseBar"><span class="cbItem"><i class="fa">${I.pencil}</i> Edit</span><span class="cbItem" style="color:#D85A30"><i class="fa">${I.trash}</i> Delete</span><span class="cbAdd"><i class="fa">${I.plus}</i> Add Task</span></div>
  </div>`;

// ---------- 4. CANVAS / LMS (hero) ----------
const canvasApp = `<div class="app">${SBAR}
  <div class="navbar"><span class="navback"><i class="fa">${I.chevL}</i> Settings</span><span class="navtitle">Learning Platforms</span><span style="width:64px"></span></div>
  <div class="appbody" style="padding:8px 22px 0">
    <div class="lmsNotice"><i class="fa">${I.shield}</i><span>Access tokens stay on this device. Semora stores only the course links and sync health.</span></div>
    <div class="secTitle">Connected</div>
    <div class="lmsCard">
      <div class="lmsHead">
        <div class="lmsIcon"><i class="fa">${I.check}</i></div>
        <div style="flex:1"><div class="lmsName">Canvas</div><div class="lmsMeta">4 courses · rajesh@stateu.edu</div></div>
        <span class="lmsStatus">synced</span>
      </div>
      <div class="lmsActions"><span class="lmsAct"><i class="fa">${I.refresh}</i> Sync now</span><span class="lmsAct dim"><i class="fa">${I.unlink}</i> Disconnect</span></div>
      <div class="lmsCourses">
        <span class="lmsTag">Biology 101</span><span class="lmsTag">Calc II</span><span class="lmsTag">History 210</span><span class="lmsTag">Chem 105</span>
      </div>
      <div class="lmsHealth"><i class="fa">${I.refresh}</i>Auto-sync on · assignments &amp; grades up to date</div>
    </div>
    <div class="secTitle">Add a platform</div>
    <div class="lmsProvider"><div class="lmsPIcon"><i class="fa">${I.blacktie}</i></div><div style="flex:1"><div class="lmsPName">Blackboard</div><div class="lmsMeta">Courses and gradebook assignments</div></div><i class="fa chev">${I.chev}</i></div>
    <div class="lmsProvider"><div class="lmsPIcon"><i class="fa">${I.graduation}</i></div><div style="flex:1"><div class="lmsPName">Moodle</div><div class="lmsMeta">Enrolled courses and assignments</div></div><i class="fa chev">${I.chev}</i></div>
  </div>
  </div>`;

// ---------- 5. CALENDAR ----------
function calGrid() {
  // Real September 2026: Sep 1 falls on a Tuesday, so two leading days (Aug 30 Sun, Aug 31 Mon).
  const cells = [{ d: 30, out: true, wknd: true }, { d: 31, out: true }];
  const dots = { 4: ['#10b981'], 9: ['#f59e0b', '#6366f1'], 11: ['#10b981'], 15: ['#6366f1'], 17: ['#6366f1', '#f59e0b'], 22: ['#f59e0b'], 26: ['#6366f1'] };
  const exam = { 11: true };
  for (let d = 1; d <= 30; d++) { const col = (d + 1) % 7; cells.push({ d, today: d === 9, wknd: col === 0 || col === 6, dots: dots[d], exam: exam[d] }); }
  [1, 2, 3].forEach((d, i) => { const col = (4 + i) % 7; cells.push({ d, out: true, wknd: col === 0 || col === 6 }); });
  return cells.map((c) => {
    const cl = ['dayInner'];
    if (c.out) cl.push('out'); if (c.wknd && !c.out && !c.today) cl.push('wknd');
    if (c.today) cl.push('today'); if (c.exam) cl.push('exam');
    const dotsH = c.dots ? `<div class="cdots">${c.dots.map((col) => `<span class="cdot" style="background:${c.today ? '#fff' : col}"></span>`).join('')}</div>`
      : (c.today ? `<div class="cdots"><span class="cdot" style="background:#fff"></span></div>` : '<div class="cdots"></div>');
    return `<div class="cell"><div class="${cl.join(' ')}">${c.d}</div>${dotsH}</div>`;
  }).join('');
}
const calApp = `<div class="app">${SBAR}
  <div class="appbody" style="padding:16px 20px 0">
    <div class="calheader">
      <div><div class="caltitle">Calendar</div><div class="monthrow"><span class="monthsub">September 2026</span><i class="fa" style="color:#8C8B94;font-size:12px">${I.caret}</i></div></div>
      <div class="modeToggle"><span class="modeBtn active">Month</span><span class="modeBtn">List</span></div>
    </div>
    <div class="navrow"><i class="fa ar">${I.chevL}</i><span class="todaylink">Today</span><i class="fa ar">${I.chev}</i></div>
    <div class="daylabels"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
    <div class="grid">${calGrid()}</div>
    <div class="legend">
      <div class="legItem"><span class="legDot" style="background:#10b981"></span><span class="legText">Biology 101</span></div>
      <div class="legItem"><span class="legDot" style="background:#6366f1"></span><span class="legText">Calc II</span></div>
      <div class="legItem"><span class="legDot" style="background:#f59e0b"></span><span class="legText">History 210</span></div>
    </div>
    <div class="agTitle">Today · 2 items</div>
    <div class="agCard">
      <div class="agRow rowborder"><div class="agTime"><div class="agTimeT">17:00</div><div class="agTimeD">DUE</div></div>
        <div class="agBar" style="background:#f59e0b"></div><div style="flex:1"><div class="agTaskT">Essay Outline</div><div class="agTaskC">History 210</div></div><span class="cbx"></span></div>
      <div class="agRow"><div class="agTime"><div class="agTimeT">23:59</div><div class="agTimeD">DUE</div></div>
        <div class="agBar" style="background:#6366f1"></div><div style="flex:1"><div class="agTaskT">Problem Set 7</div><div class="agTaskC">Calc II</div></div><span class="cbx"></span></div>
    </div>
  </div>
  ${tab('calendar')}</div>`;

// ---------- 6. ME / PRO ----------
const meApp = `<div class="app">${SBAR}
  <div class="appbody" style="padding:16px 22px 0">
    <div class="profileRow"><div class="avatar">R</div><div style="flex:1"><div class="profileName">Rajesh</div><div class="profileSub">Fall 2026</div></div></div>
    <div class="proCard">
      <div class="proGlow"></div>
      <div style="position:relative">
        <div class="proLabel"><i class="fa">${I.star}</i><span>SEMORA PRO</span></div>
        <div class="proTitle">Unlimited scans, smart plans, grade forecasts.</div>
        <div class="proFeat"><i class="fa">${I.check}</i>Unlimited syllabus scans</div>
        <div class="proFeat"><i class="fa">${I.check}</i>Grade forecasts &amp; what-if</div>
        <div class="proFeat"><i class="fa">${I.check}</i>Canvas &amp; LMS auto-sync</div>
        <div class="proPriceRow"><span class="proPriceAmt">$19.99</span><span class="proPricePer">/year · cancel any time</span></div>
        <div class="proBtn">Try 7 days free</div>
        <div class="proAlt">Or $3.99/month</div>
      </div>
    </div>
    <div class="statsGrid">
      <div class="statCard"><div class="statNum" style="color:#6B46C1">4</div><div class="statLabel">COURSES</div></div>
      <div class="statCard"><div class="statNum" style="color:#1C1B1F">12</div><div class="statLabel">DONE</div></div>
      <div class="statCard"><div class="statNum" style="color:#D85A30">3</div><div class="statLabel">PENDING</div></div>
    </div>
    <div class="settingsCard">
      <div class="settingsRow rowborder"><i class="fa setIc">${I.cog}</i><span class="setLbl">Settings</span><i class="fa chev">${I.chev}</i></div>
      <div class="settingsRow rowborder"><i class="fa setIc">${I.qcircle}</i><span class="setLbl">Help &amp; FAQ</span><i class="fa chev">${I.chev}</i></div>
      <div class="settingsRow"><i class="fa setIc">${I.starO}</i><span class="setLbl">Rate Semora</span><i class="fa chev">${I.chev}</i></div>
    </div>
  </div>
  ${tab('me')}</div>`;

// ===================== AURORA COMMAND CENTER CHROME =====================
const CSS = `
@font-face{font-family:'Fr7';src:url('${FR('700Bold/Fraunces_700Bold.ttf')}');}
@font-face{font-family:'Fr6';src:url('${FR('600SemiBold/Fraunces_600SemiBold.ttf')}');}
@font-face{font-family:'fa';src:url('${FA}');}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:642px;height:1389px;overflow:hidden;}
.fa{font-family:'fa';font-style:normal;font-weight:normal;line-height:1;-webkit-font-smoothing:antialiased;}

/* ---- warm-light aurora field ---- */
.stage{width:642px;height:1389px;position:relative;overflow:hidden;
  background:linear-gradient(178deg,#FBFAFF 0%,#F4EFFF 52%,#EBE1FF 100%);}
.orb1{position:absolute;width:640px;height:640px;border-radius:50%;right:-200px;top:-180px;z-index:1;mix-blend-mode:multiply;}
.orb2{position:absolute;width:540px;height:540px;border-radius:50%;left:-220px;top:330px;z-index:1;mix-blend-mode:multiply;
  background:radial-gradient(circle,rgba(166,107,232,0.24),rgba(166,107,232,0) 68%);}
.orb3{position:absolute;width:520px;height:520px;border-radius:50%;left:32%;bottom:-250px;z-index:1;
  background:radial-gradient(circle,rgba(255,208,150,0.34),rgba(255,208,150,0) 70%);}
.ribbon{position:absolute;width:940px;height:210px;left:-150px;top:660px;transform:rotate(-31deg);z-index:1;
  background:linear-gradient(90deg,rgba(124,77,224,0),rgba(124,77,224,0.26),rgba(185,140,255,0.26),rgba(185,140,255,0));filter:blur(42px);}
.sheen{position:absolute;left:0;right:0;top:0;height:400px;z-index:1;background:linear-gradient(180deg,rgba(255,255,255,0.55),rgba(255,255,255,0) 100%);}
.grain{position:absolute;inset:0;width:100%;height:100%;z-index:2;opacity:0.05;mix-blend-mode:soft-light;pointer-events:none;}
.vig{position:absolute;inset:0;z-index:3;background:radial-gradient(115% 78% at 50% 40%,rgba(0,0,0,0) 58%,rgba(74,43,149,0.10) 100%);}

/* ---- caption ---- */
.cap{position:absolute;left:0;right:0;top:0;height:338px;padding:60px 46px 0;text-align:center;z-index:12;}
.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:9px 17px;border-radius:999px;
  background:rgba(255,255,255,0.62);border:1px solid rgba(255,255,255,0.9);
  box-shadow:0 6px 16px rgba(90,50,160,0.10);
  font:800 14px -apple-system,'Helvetica Neue',sans-serif;color:#7C4DE0;letter-spacing:1.4px;text-transform:uppercase;}
.eyebrow .fa{font-size:12px;color:#E0952B;}
.headline{margin-top:18px;font-family:'Fr7';color:#1C1B1F;letter-spacing:-1px;line-height:0.98;}
.headline .accent{color:#6B46C1;}
.spark{font-family:'fa';font-style:normal;color:#E8A93B;font-size:0.42em;vertical-align:0.5em;margin-left:.12em;}
.subhead{margin-top:15px;font:500 20px -apple-system,'Helvetica Neue',sans-serif;color:#55555C;
  line-height:1.34;letter-spacing:0.1px;max-width:450px;margin-left:auto;margin-right:auto;}

/* ---- device ---- */
.deviceWrap{position:absolute;left:50%;top:344px;transform:translateX(-50%);z-index:5;}
.contactGlow{position:absolute;left:50%;top:70px;transform:translateX(-50%);width:600px;height:600px;border-radius:50%;
  background:radial-gradient(circle,rgba(160,120,245,0.40),rgba(160,120,245,0) 60%);z-index:-1;}
.device{width:524px;background:linear-gradient(150deg,#1a1820,#0B0A10);border-radius:58px;padding:13px;position:relative;
  box-shadow:0 50px 100px rgba(80,50,140,0.30),0 18px 40px rgba(80,50,140,0.20),inset 0 0 0 1.5px rgba(255,255,255,0.10);
  transform-origin:center center;}
.device::before{content:'';position:absolute;inset:4px;border-radius:54px;border:1px solid rgba(255,255,255,0.08);pointer-events:none;}
.screen{width:498px;height:1078px;overflow:hidden;border-radius:46px;background:#FAF9F5;position:relative;}
.island{position:absolute;left:50%;top:15px;transform:translateX(-50%);width:112px;height:33px;border-radius:20px;background:#000;z-index:40;}
.app{width:414px;height:896px;transform:scale(1.2029);transform-origin:top left;position:relative;background:#FAF9F5;font-family:-apple-system,'Helvetica Neue',sans-serif;}
.appbody{height:100%;}
.rowborder{border-top:.5px solid rgba(28,27,31,0.08);}
.chev{color:#8C8B94;font-size:13px;}

/* ---- floating glass chips ---- */
.chip{position:absolute;z-index:20;background:rgba(255,255,255,0.96);border-radius:20px;padding:13px 17px;display:flex;align-items:center;gap:13px;
  border:1px solid rgba(255,255,255,0.9);box-shadow:0 26px 50px rgba(80,40,150,0.24),0 8px 18px rgba(80,40,150,0.14);}
.chip.ghost{z-index:6;opacity:0.82;box-shadow:0 18px 34px rgba(80,40,150,0.16);}
.chipIcon{width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
.chipT{font:800 17px -apple-system;color:#1C1B1F;letter-spacing:-.2px;white-space:nowrap;}
.chipS{font:500 13px -apple-system;color:#8C8B94;margin-top:2px;white-space:nowrap;}
.ic-brand{background:#EEEDFE;color:#6B46C1;}.ic-coral{background:#FAECE7;color:#D85A30;}.ic-teal{background:#E1F5EE;color:#0F6E56;}.ic-blue{background:#E6F1FB;color:#185FA5;}.ic-gold{background:#FBEFD6;color:#B47818;}.ic-green{background:#DCF3E9;color:#0F6E56;}

/* canvas flourish */
.pulse{position:absolute;z-index:19;border-radius:50%;border:2px solid rgba(15,110,86,0.35);}
.ribbonChip{position:absolute;z-index:20;background:rgba(15,110,86,0.96);color:#fff;border-radius:14px;padding:11px 16px;display:flex;align-items:center;gap:9px;
  box-shadow:0 20px 40px rgba(15,110,86,0.32);font:800 15px -apple-system;letter-spacing:-.2px;white-space:nowrap;}
.ribbonChip .fa{font-size:13px;}
.syncArcs{position:absolute;z-index:18;pointer-events:none;}

/* status bar */
.sbar{height:52px;display:flex;align-items:center;justify-content:space-between;padding:14px 24px 0 26px;}
.sbar .t{font:600 16px -apple-system;color:#1C1B1F;letter-spacing:.3px;}
.sbar .r{display:flex;align-items:center;gap:7px;}

/* SCAN */
.h1{font-family:'Fr6';font-size:29px;color:#1C1B1F;letter-spacing:-.5px;}
.sub2{font:400 15px -apple-system;color:#55555C;margin-top:5px;line-height:1.4;}
.scanframe{background:#6B46C1;border-radius:24px;padding:26px;margin:18px 0;text-align:center;}
.corners{position:relative;height:150px;display:flex;align-items:center;justify-content:center;}
.cn{position:absolute;width:28px;height:28px;border:3px solid #fff;}
.tl{top:0;left:14px;border-right:0;border-bottom:0;border-top-left-radius:5px;}
.tr{top:0;right:14px;border-left:0;border-bottom:0;border-top-right-radius:5px;}
.bl{bottom:0;left:14px;border-right:0;border-top:0;border-bottom-left-radius:5px;}
.br{bottom:0;right:14px;border-left:0;border-top:0;border-bottom-right-radius:5px;}
.docmock{background:rgba(255,255,255,0.16);border-radius:8px;padding:15px;width:140px;display:flex;flex-direction:column;gap:6px;}
.ml{height:3.5px;border-radius:2px;background:rgba(255,255,255,0.5);}
.scanline{position:absolute;left:30px;right:30px;top:50%;height:2.5px;background:#FAC775;border-radius:2px;box-shadow:0 0 10px 1px #FAC775;}
.framelabel{font:600 15px -apple-system;color:rgba(255,255,255,0.74);letter-spacing:.6px;margin-top:12px;}
.actions{display:flex;flex-direction:column;gap:10px;}
.actionCard{display:flex;align-items:center;gap:15px;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:20px;padding:16px;box-shadow:0 1px 2px rgba(20,8,46,0.03);}
.actionIcon{width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;}
.actionTitle{font:600 15px -apple-system;color:#1C1B1F;}
.actionSub{font:400 14px -apple-system;color:#8C8B94;margin-top:2px;}

/* tab bar */
.tabbar{position:absolute;left:0;right:0;bottom:0;height:78px;display:flex;align-items:flex-start;justify-content:space-around;padding-top:9px;background:rgba(250,249,245,0.98);border-top:.5px solid rgba(28,27,31,0.08);}
.tab{display:flex;flex-direction:column;align-items:center;gap:3px;width:64px;}
.tab .iw{width:40px;height:28px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:19px;color:#8C8B94;}
.tab.active .iw{background:#EEEDFE;color:#6B46C1;}
.tab .lbl{font:500 11px -apple-system;color:#8C8B94;}
.tab.active .lbl{color:#6B46C1;}
.fab{width:48px;height:48px;border-radius:15px;background:#6B46C1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:19px;margin-top:-7px;box-shadow:0 7px 16px rgba(107,70,193,0.42);}
.tab.scan .lbl{margin-top:5px;}

/* TODAY */
.eyelabel{font:600 13px -apple-system;color:#8C8B94;letter-spacing:1px;}
.greeting{font-family:'Fr7';font-size:27px;color:#1C1B1F;margin-top:4px;letter-spacing:-.5px;}
.semlabel{font:400 14px -apple-system;color:#8C8B94;margin-top:2px;}
.secrow{margin:16px 0 9px;}
.sectitle{font:600 14px -apple-system;color:#55555C;letter-spacing:.4px;}
.sectitle.coral{color:#D85A30;}
.overdueCard{background:#FAECE7;border:1px solid #D85A30;border-radius:18px;padding:0 15px;}
.overdueRow{display:flex;align-items:center;gap:13px;padding:13px 0;}
.cbx{width:21px;height:21px;border-radius:7px;border:1.5px solid #8C8B94;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.cbx-coral{border-color:#D85A30;}
.cbx-done{background:#0F6E56;border-color:#0F6E56;color:#fff;font-size:10px;}
.taskTitle{font:600 15px -apple-system;color:#1C1B1F;}
.taskTitle.done{text-decoration:line-through;color:#8C8B94;font-weight:500;}
.taskmeta{display:flex;align-items:center;gap:6px;margin-top:3px;}
.dot{width:7px;height:7px;border-radius:4px;}
.taskcourse{font:400 14px -apple-system;color:#8C8B94;}
.taskcourse.coral{color:#D85A30;}
.odbadge{background:#fff;border-radius:8px;padding:4px 9px;font:700 13px -apple-system;color:#D85A30;}
.hero{background:#6B46C1;border-radius:20px;padding:19px;margin-top:16px;overflow:hidden;position:relative;box-shadow:0 12px 26px rgba(107,70,193,0.28);}
.herotop{display:flex;justify-content:space-between;align-items:center;}
.heroeye{font:800 13px -apple-system;color:rgba(255,255,255,0.9);letter-spacing:1.5px;}
.herobadge{background:rgba(255,255,255,0.22);border-radius:999px;padding:4px 12px;font:700 12px -apple-system;color:#fff;letter-spacing:.5px;}
.herotitle{font-family:'Fr7';font-size:22px;color:#fff;margin-top:11px;line-height:1.15;}
.herosub{font:400 15px -apple-system;color:rgba(255,255,255,0.82);margin-top:6px;}
.progressTrack{height:7px;border-radius:4px;background:rgba(28,27,31,0.08);margin-bottom:11px;overflow:hidden;}
.progressFill{height:100%;border-radius:4px;background:#6B46C1;}
.card{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:0 15px;}
.taskRow{display:flex;align-items:center;gap:13px;padding:13px 0;}
.weekCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:20px;padding:16px 16px 14px;}
.weekStats{display:flex;justify-content:space-between;margin-bottom:6px;}
.ws{flex:1;text-align:center;}
.wsNum{font:800 25px -apple-system;color:#1C1B1F;}
.wsLbl{font:600 11px -apple-system;color:#8C8B94;letter-spacing:.5px;margin-top:2px;}
.weekBars{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;border-top:.5px solid rgba(28,27,31,0.06);padding-top:12px;margin-top:10px;}
.wb{flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;}
.wbTrack{width:100%;height:46px;display:flex;align-items:flex-end;justify-content:center;}
.wbFill{width:22px;border-radius:6px;background:#DDD4F3;min-height:6px;}
.wbFill.hot{background:#6B46C1;}
.wbDay{font:600 12px -apple-system;color:#8C8B94;}

/* COURSE / GRADES */
.navbar{display:flex;align-items:center;justify-content:space-between;padding:2px 18px 8px;}
.navback{font:400 16px -apple-system;color:#6B46C1;}
.navtitle{font:600 17px -apple-system;color:#1C1B1F;}
.courseHead{display:flex;flex-direction:row;align-items:center;gap:15px;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:17px;margin-top:6px;}
.courseIcon{width:50px;height:50px;border-radius:15px;background:#EEEDFE;color:#6B46C1;display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0;}
.courseName{font-family:'Fr7';font-size:22px;color:#1C1B1F;letter-spacing:-.5px;}
.courseInstr{font:400 14px -apple-system;color:#8C8B94;margin-top:2px;}
.courseCounts{display:flex;align-items:center;gap:6px;font:400 13px -apple-system;flex-shrink:0;}
.cdotsep{color:#C9C8CE;}
.metaCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:0 15px;margin-top:13px;}
.metaRow{display:flex;align-items:center;gap:13px;padding:14px 0;}
.metaIc{color:#8C8B94;font-size:16px;width:20px;text-align:center;}
.metaT{font:600 14px -apple-system;color:#1C1B1F;}
.metaS{font:400 14px -apple-system;color:#8C8B94;margin-top:2px;}
.gradeCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:18px;margin-top:13px;}
.gradeTop{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:13px;}
.gradeLbl{font:700 14px -apple-system;color:#8C8B94;letter-spacing:.5px;}
.gradePct{font-family:'Fr7';font-size:33px;color:#1C1B1F;margin-top:3px;}
.gradeBadge{width:52px;height:52px;border-radius:15px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font:800 26px -apple-system;}
.gradeBarBg{height:9px;background:rgba(28,27,31,0.08);border-radius:5px;overflow:hidden;}
.gradeBarFill{height:9px;border-radius:5px;background:linear-gradient(90deg,#3b82f6,#2563eb);}
.gradeMeta{display:flex;justify-content:space-between;margin-top:7px;font:500 14px -apple-system;color:#8C8B94;}
.gradeMetaR{color:#55555C;}
.gradeCtx{background:#EEEDFE;border-radius:9px;padding:11px 12px;margin-top:10px;font:500 14px -apple-system;color:#6B46C1;line-height:1.35;}
.whatif{border-top:.5px solid rgba(28,27,31,0.08);margin-top:15px;padding-top:14px;}
.whatifHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.whatifTitle{font-family:'Fr6';font-size:17px;color:#1C1B1F;}
.proPill{background:#6B46C1;color:#fff;border-radius:6px;padding:3px 8px;font:800 10px -apple-system;letter-spacing:.6px;}
.whatifSub{font:400 14px -apple-system;color:#8C8B94;line-height:1.4;}
.scoreTag{font:800 15px -apple-system;color:#0F6E56;}
.courseBar{position:absolute;left:0;right:0;bottom:0;height:66px;display:flex;align-items:center;justify-content:space-around;background:rgba(250,249,245,0.98);border-top:.5px solid rgba(28,27,31,0.08);}
.cbItem{font:500 15px -apple-system;color:#55555C;display:flex;align-items:center;gap:7px;}
.cbItem .fa{font-size:14px;}
.cbAdd{font:700 15px -apple-system;color:#fff;background:#6B46C1;border-radius:11px;padding:10px 16px;display:flex;align-items:center;gap:7px;}
.cbAdd .fa{font-size:13px;}

/* CANVAS / LMS */
.lmsNotice{display:flex;gap:11px;align-items:flex-start;background:#EEEDFE;border-radius:15px;padding:14px;margin-top:6px;}
.lmsNotice .fa{color:#6B46C1;font-size:15px;margin-top:1px;}
.lmsNotice span{flex:1;font:400 13px -apple-system;color:#55555C;line-height:1.4;}
.secTitle{font-family:'Fr6';font-size:19px;color:#1C1B1F;margin:18px 0 10px;}
.lmsCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:16px;}
.lmsHead{display:flex;align-items:center;gap:13px;}
.lmsIcon{width:42px;height:42px;border-radius:13px;background:#EEEDFE;color:#6B46C1;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
.lmsName{font:800 16px -apple-system;color:#1C1B1F;}
.lmsMeta{font:400 13px -apple-system;color:#8C8B94;margin-top:2px;}
.lmsStatus{font:800 13px -apple-system;color:#0F766E;text-transform:capitalize;}
.lmsActions{display:flex;gap:24px;border-top:.5px solid rgba(28,27,31,0.08);margin-top:14px;padding-top:13px;}
.lmsAct{font:700 14px -apple-system;color:#6B46C1;display:flex;align-items:center;gap:7px;}
.lmsAct .fa{font-size:12px;}
.lmsAct.dim{color:#8C8B94;}
.lmsProvider{display:flex;align-items:center;gap:13px;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:16px;padding:15px;margin-bottom:9px;}
.lmsPIcon{width:42px;height:42px;border-radius:13px;background:#EEEDFE;color:#6B46C1;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
.lmsPName{font:700 15px -apple-system;color:#1C1B1F;}
.lmsCourses{display:flex;flex-wrap:wrap;gap:7px;border-top:.5px solid rgba(28,27,31,0.08);margin-top:14px;padding-top:14px;}
.lmsTag{background:#F3F1FB;color:#6B46C1;border-radius:8px;padding:6px 11px;font:600 13px -apple-system;}
.lmsHealth{display:flex;align-items:center;gap:8px;margin-top:13px;font:600 13px -apple-system;color:#0F6E56;}
.lmsHealth .fa{font-size:12px;}
.bokeh{position:absolute;border-radius:50%;filter:blur(7px);z-index:2;pointer-events:none;}

/* CALENDAR */
.calheader{display:flex;justify-content:space-between;align-items:flex-end;}
.caltitle{font-family:'Fr6';font-size:29px;color:#1C1B1F;letter-spacing:-.5px;}
.monthrow{display:flex;align-items:center;gap:5px;margin-top:4px;}
.monthsub{font:500 15px -apple-system;color:#55555C;}
.modeToggle{display:flex;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:10px;padding:3px;}
.modeBtn{padding:6px 13px;border-radius:7px;font:500 14px -apple-system;color:#8C8B94;}
.modeBtn.active{background:#1C1B1F;color:#fff;}
.navrow{display:flex;justify-content:space-between;align-items:center;margin:16px 6px 13px;}
.navrow .ar{color:#6B46C1;font-size:15px;}
.todaylink{font:600 15px -apple-system;color:#6B46C1;}
.daylabels{display:flex;margin-bottom:7px;}
.daylabels span{flex:1;text-align:center;font:600 14px -apple-system;color:#8C8B94;letter-spacing:.6px;}
.grid{display:flex;flex-wrap:wrap;}
.cell{width:14.28%;display:flex;flex-direction:column;align-items:center;padding:4px 0;}
.dayInner{width:38px;height:38px;border-radius:19px;display:flex;align-items:center;justify-content:center;font:400 15px -apple-system;color:#1C1B1F;}
.dayInner.out{color:#C9C8CE;}.dayInner.wknd{color:#8C8B94;}
.dayInner.today{background:#6B46C1;color:#fff;font-weight:600;}
.dayInner.exam{background:#EEEDFE;color:#6B46C1;font-weight:600;}
.cdots{display:flex;gap:3px;height:7px;margin-top:3px;justify-content:center;}
.cdot{width:5px;height:5px;border-radius:3px;}
.legend{display:flex;justify-content:center;gap:16px;margin:14px 0 16px;}
.legItem{display:flex;align-items:center;gap:6px;}
.legDot{width:8px;height:8px;border-radius:4px;}
.legText{font:400 13px -apple-system;color:#8C8B94;}
.agTitle{font:600 15px -apple-system;color:#55555C;margin-bottom:9px;}
.agCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:0 15px;}
.agRow{display:flex;align-items:center;gap:13px;padding:13px 0;}
.agTime{width:46px;text-align:center;}
.agTimeT{font:600 15px -apple-system;color:#D85A30;}
.agTimeD{font:400 11px -apple-system;color:#D85A30;}
.agBar{width:3.5px;align-self:stretch;border-radius:2px;min-height:34px;}
.agTaskT{font:600 15px -apple-system;color:#1C1B1F;}
.agTaskC{font:400 14px -apple-system;color:#8C8B94;margin-top:2px;}

/* ME / PRO */
.profileRow{display:flex;align-items:center;gap:15px;padding:6px 0;margin-bottom:18px;}
.avatar{width:62px;height:62px;border-radius:31px;background:#6B46C1;color:#fff;display:flex;align-items:center;justify-content:center;font:600 24px -apple-system;}
.profileName{font-family:'Fr6';font-size:21px;color:#1C1B1F;}
.profileSub{font:400 15px -apple-system;color:#8C8B94;margin-top:2px;}
.proCard{background:#1C1B1F;border-radius:24px;padding:24px;margin-bottom:18px;overflow:hidden;position:relative;box-shadow:0 20px 44px rgba(20,8,46,0.28);}
.proGlow{position:absolute;right:-30px;top:-30px;width:150px;height:150px;border-radius:75px;background:#6B46C1;opacity:.45;}
.proLabel{display:flex;align-items:center;gap:7px;margin-bottom:9px;}
.proLabel .fa{color:#CECBF6;font-size:12px;}
.proLabel span{font:800 13px -apple-system;color:#CECBF6;letter-spacing:1.5px;}
.proTitle{font-family:'Fr7';font-size:23px;color:#fff;line-height:1.25;max-width:270px;}
.proFeat{display:flex;align-items:center;gap:9px;margin-top:11px;font:500 15px -apple-system;color:rgba(255,255,255,0.9);}
.proFeat .fa{color:#8FE3C0;font-size:13px;}
.proPriceRow{display:flex;align-items:baseline;gap:8px;margin-top:18px;}
.proPriceAmt{font:800 29px -apple-system;color:#fff;}
.proPricePer{font:400 15px -apple-system;color:rgba(255,255,255,0.6);}
.proBtn{background:#fff;color:#1C1B1F;border-radius:15px;padding:14px;text-align:center;font:700 16px -apple-system;margin-top:15px;}
.proAlt{font:400 14px -apple-system;color:rgba(255,255,255,0.5);text-align:center;margin-top:11px;}
.statsGrid{display:flex;gap:9px;margin-bottom:18px;}
.statCard{flex:1;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:14px;text-align:center;}
.statNum{font:700 24px -apple-system;}
.statLabel{font:600 12px -apple-system;color:#8C8B94;letter-spacing:.5px;margin-top:3px;}
.settingsCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:0 15px;}
.settingsRow{display:flex;align-items:center;gap:13px;padding:15px 0;}
.setIc{color:#55555C;font-size:17px;width:20px;text-align:center;}
.setLbl{flex:1;font:400 15px -apple-system;color:#1C1B1F;}
`;

const GRAIN = `<svg class="grain" xmlns="http://www.w3.org/2000/svg"><defs><filter id="gf"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="2" stitchTiles="stitch"/></filter></defs><rect width="100%" height="100%" filter="url(#gf)"/></svg>`;

const page = (o) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<div class="stage">
  <div class="orb1" style="background:radial-gradient(circle,${o.orb} ,rgba(255,255,255,0) 66%)"></div>
  <div class="orb2"></div><div class="orb3"></div>
  <div class="ribbon"></div>
  <div class="sheen"></div>
  ${GRAIN}
  ${BOKEH}
  ${o.proField || ''}
  <div class="cap">
    <div class="eyebrow"><i class="fa">${o.eyeIcon}</i>${o.eyebrow}</div>
    <div class="headline" style="font-size:${o.hSize}px">${o.headline}</div>
    <div class="subhead">${o.subhead}</div>
  </div>
  <div class="deviceWrap">
    <div class="contactGlow"></div>
    <div class="device" style="transform:${o.tilt}"><div class="screen"><div class="island"></div>${o.app}</div></div>
  </div>
  ${o.extras || ''}
  <div class="vig"></div>
</div>
<div style="position:absolute;opacity:0;font-family:'Fr7'">.</div>
<div style="position:absolute;opacity:0;font-family:'Fr6'">.</div>
<div style="position:absolute;opacity:0;font-family:'fa'">.</div>
</body></html>`;

const chip = (pos, cls, icon, t, s, rot, ghost) =>
  `<div class="chip ${ghost ? 'ghost' : ''}" style="${pos};transform:rotate(${rot}deg)">
     <div class="chipIcon ic-${cls}"><i class="fa">${icon}</i></div>
     <div><div class="chipT">${t}</div><div class="chipS">${s}</div></div>
   </div>`;

const TILT_L = 'perspective(1900px) rotateY(4deg) rotateZ(-1.5deg)';
const TILT_R = 'perspective(1900px) rotateY(-4deg) rotateZ(1.5deg)';
const TILT_HERO = 'perspective(1900px) rotateY(-2deg) rotateZ(0deg) scale(1.055)';

const BOKEH = `
  <div class="bokeh" style="width:78px;height:78px;right:2px;top:970px;background:rgba(166,107,232,0.22)"></div>
  <div class="bokeh" style="width:60px;height:60px;left:8px;top:1050px;background:rgba(138,92,240,0.28)"></div>
  <div class="bokeh" style="width:40px;height:40px;right:24px;top:1190px;background:rgba(244,208,106,0.34)"></div>`;

// Canvas screen marketing flourish (green auto-sync pulse + rescheduled ribbon + sync arcs)
const canvasExtras = `
  <div class="pulse" style="width:118px;height:118px;left:452px;top:352px;"></div>
  <div class="pulse" style="width:168px;height:168px;left:427px;top:327px;border-color:rgba(15,110,86,0.16);"></div>
  ${chip('top:380px;right:34px', 'green', I.refresh, 'Auto-synced', '2 min ago', -4)}
  <div class="ribbonChip" style="left:20px;top:566px;transform:rotate(4deg)"><i class="fa">${I.bell}</i>Deadline moved → reminder rescheduled</div>
  <svg class="syncArcs" style="left:6px;top:474px" width="150" height="230" viewBox="0 0 150 230">
    <defs><linearGradient id="sg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#6B46C1"/><stop offset="1" stop-color="#0F6E56"/></linearGradient></defs>
    <path d="M22 205 C 70 190, 120 150, 140 96" fill="none" stroke="url(#sg)" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" opacity="0.85"/>
    <path d="M14 176 C 60 168, 108 130, 132 70" fill="none" stroke="url(#sg)" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" opacity="0.5"/>
    <circle cx="20" cy="208" r="16" fill="#fff" stroke="#E23C32" stroke-width="2.5"/>
    <text x="20" y="214" font-family="Helvetica,Arial" font-size="16" font-weight="800" fill="#E23C32" text-anchor="middle">C</text>
  </svg>`;

const PRO_FIELD = `<div style="position:absolute;left:0;right:0;bottom:0;height:640px;z-index:1;
  background:linear-gradient(180deg,rgba(107,70,193,0) 0%,rgba(107,70,193,0.14) 60%,rgba(107,70,193,0.26) 100%);"></div>
  <div style="position:absolute;right:-120px;bottom:120px;width:420px;height:420px;border-radius:50%;z-index:1;
  background:radial-gradient(circle,rgba(244,208,106,0.22),rgba(244,208,106,0) 68%)"></div>`;

const pages = [
  {
    f: 'screen-1.html', out: '01-scan.png',
    eyebrow: 'AI-Powered', eyeIcon: I.magic, hSize: 62,
    headline: 'Snap your<br><span class="accent">syllabus</span><i class="spark">' + I.magic + '</i>',
    subhead: 'AI reads any PDF or photo and pulls out every deadline, exam and task — in seconds.',
    orb: 'rgba(138,92,240,0.42)', tilt: TILT_L, app: scanApp,
    extras: chip('top:380px;right:32px', 'brand', I.bolt, '14 deadlines', 'found in 1 PDF', -4),
  },
  {
    f: 'screen-2.html', out: '02-today.png',
    eyebrow: 'Stay on track', eyeIcon: I.sun, hSize: 55,
    headline: 'Your day,<br>already <span class="accent">sorted</span>',
    subhead: 'What’s next, what’s due, what’s running late — the moment you open the app.',
    orb: 'rgba(240,149,94,0.40)', tilt: TILT_R, app: todayApp,
    extras: chip('top:380px;right:32px', 'coral', I.bell, 'Due in 3 hours', 'Problem Set 7', -4),
  },
  {
    f: 'screen-3.html', out: '03-grades.png',
    eyebrow: 'Grade tracker', eyeIcon: I.graduation, hSize: 52,
    headline: 'Know exactly<br>where you <span class="accent">stand</span>',
    subhead: 'Your live grade, your letter, and the exact score you need on the final for an A.',
    orb: 'rgba(110,123,240,0.42)', tilt: TILT_L, app: courseApp,
    extras: chip('top:380px;right:32px', 'blue', I.linechart, 'Need 88%', 'on the final for an A', -4),
  },
  {
    f: 'screen-4.html', out: '04-canvas.png',
    eyebrow: 'Canvas Auto-Sync', eyeIcon: I.refresh, hSize: 54,
    headline: 'Canvas that<br>updates <span class="accent">itself</span><i class="spark">' + I.bolt + '</i>',
    subhead: 'Semora imports your coursework and auto-reschedules reminders when a deadline moves or a grade posts.',
    orb: 'rgba(109,92,245,0.52)', tilt: TILT_HERO, app: canvasApp,
    extras: canvasExtras,
  },
  {
    f: 'screen-5.html', out: '05-calendar.png',
    eyebrow: 'Always planned', eyeIcon: I.calendar, hSize: 50,
    headline: 'Your whole<br>semester, <span class="accent">one view</span>',
    subhead: 'Every class, deadline and exam mapped across the term — nothing sneaks up on you.',
    orb: 'rgba(79,182,196,0.40)', tilt: TILT_L, app: calApp,
    extras: chip('top:380px;right:32px', 'teal', I.flag, 'Midterm Friday', 'Biology 101 · in 2 days', -4),
  },
  {
    f: 'screen-6.html', out: '06-pro.png',
    eyebrow: 'Semora Pro', eyeIcon: I.star, hSize: 55,
    headline: '<span class="accent">Unlock</span> the<br>full semester<i class="spark">' + I.star + '</i>',
    subhead: 'Unlimited scans, grade forecasts, Canvas sync and smart study plans. Try 7 days free.',
    orb: 'rgba(138,92,240,0.40)', tilt: TILT_R, app: meApp, proField: PRO_FIELD,
    extras: chip('top:380px;right:32px', 'brand', I.star, '7 days free', 'then $3.99/mo', -4),
  },
];

pages.forEach((p) => fs.writeFileSync(path.join(OUT, p.f), page(p)));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(pages.map((p) => ({ html: p.f, png: p.out })), null, 2));
console.log('Wrote', pages.length, 'HTML files to', OUT);
