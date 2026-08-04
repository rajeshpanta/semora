/* Generates 5 App Store iPad marketing screenshots (2048x2732) for Semora,
   styled to MATCH the existing live iPhone set: flat purple bg, all-caps heavy
   sans caption (big line + smaller line), realistic device frame, full device.
   Themes/order mirror the iPhone set:
     SCAN YOUR SYLLABUS / NEVER MISS A DEADLINE / TRACK YOUR GRADES /
     PLAN YOUR SEMESTER / GO PRO
   Recreates the real app UI from lib/constants + the actual screens, using the
   bundled Fraunces + FontAwesome fonts. Render: Chrome headless 1024x1366 @2x. */
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/smile/Desktop/semora';
const FR = (w) => `file://${ROOT}/node_modules/@expo-google-fonts/fraunces/${w}`;
const FA = `file://${ROOT}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf`;
const OUT = path.join(ROOT, 'store-screenshots', 'ipad');
fs.mkdirSync(OUT, { recursive: true });

const BG = '#6845BD'; // sampled from the live iPhone screenshots

const I = {
  bolt: '&#xf0e7;', camera: '&#xf030;', filepdf: '&#xf1c1;', image: '&#xf03e;',
  folder: '&#xf115;', chev: '&#xf054;', chevL: '&#xf053;', check: '&#xf00c;',
  flag: '&#xf024;', sun: '&#xf185;', book: '&#xf02d;', calendar: '&#xf073;',
  user: '&#xf007;', star: '&#xf005;', linechart: '&#xf201;', bell: '&#xf0f3;',
  caret: '&#xf0d7;', cog: '&#xf013;', qcircle: '&#xf059;', starO: '&#xf006;',
  clock: '&#xf017;', mapmarker: '&#xf041;', plus: '&#xf067;', pencil: '&#xf040;',
  trash: '&#xf1f8;',
};

const SBAR = `<div class="sbar"><span class="t">9:41</span><span class="r">
<svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" fill="#1C1B1F"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="#1C1B1F"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="#1C1B1F"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="#1C1B1F"/></svg>
<svg width="16" height="11" viewBox="0 0 16 12"><path fill="#1C1B1F" d="M8 2.6c2.5 0 4.8 1 6.5 2.6l-1.4 1.5C11.8 5.4 10 4.6 8 4.6S4.2 5.4 2.9 6.7L1.5 5.2C3.2 3.6 5.5 2.6 8 2.6zM8 6.4c1.4 0 2.7.6 3.7 1.5l-1.5 1.6C9.6 9 8.8 8.6 8 8.6s-1.6.4-2.2 .9L4.3 7.9C5.3 7 6.6 6.4 8 6.4zM8 9.9l1.6 1.7c-.4 .4-1 .4-1.3 0L8 9.9z"/></svg>
<svg width="25" height="12" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="#1C1B1F" stroke-opacity="0.4"/><rect x="2" y="2" width="17" height="8" rx="1.5" fill="#1C1B1F"/><rect x="22.5" y="3.5" width="1.8" height="5" rx="0.9" fill="#1C1B1F" fill-opacity="0.5"/></svg>
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

// ---------- SCAN ----------
const scanApp = `<div class="app">${SBAR}
  <div class="appbody" style="padding:16px 20px 0">
    <div class="h1">Scan syllabus</div>
    <div class="sub2">Snap it, upload it, or drag it in.<br>We'll pull every deadline.</div>
    <div class="pill pill-brand"><i class="fa">${I.bolt}</i><span>2 of 2 free scans left</span></div>
    <div class="scanframe">
      <div class="corners">
        <span class="cn tl"></span><span class="cn tr"></span><span class="cn bl"></span><span class="cn br"></span>
        <div class="docmock"><div class="ml" style="width:60%"></div><div class="ml" style="width:80%"></div><div class="ml" style="width:45%"></div><div class="ml" style="width:70%;margin-top:8px"></div><div class="ml" style="width:60%"></div></div>
        <div class="scanline"></div>
      </div>
      <div class="framelabel">PDF &amp; PHOTO SUPPORTED</div>
    </div>
    <div class="actions">
      ${action('brand', I.camera, 'Take a photo', 'Printed handout or whiteboard')}
      ${action('coral', I.filepdf, 'Upload PDF', 'Email attachment or download')}
      ${action('teal', I.image, 'Choose from Photos', 'Select from your photo library')}
    </div>
  </div>
  ${tab('scan')}</div>`;

// ---------- TODAY ----------
const todayApp = `<div class="app">${SBAR}
  <div class="appbody" style="padding:14px 20px 0">
    <div class="eyelabel">TUESDAY, JUNE 9</div>
    <div class="greeting">Good morning, Rajesh</div>
    <div class="semlabel">Summer 2026</div>
    <div class="secrow"><span class="sectitle coral">Overdue · 1</span></div>
    <div class="overdueCard">
      <div class="overdueRow"><span class="cbx cbx-coral"></span>
        <div style="flex:1"><div class="taskTitle">Lab Report 3</div>
          <div class="taskmeta"><span class="dot" style="background:#10b981"></span><span class="taskcourse coral">Biology 101 · Jun 6</span></div></div>
        <span class="odbadge">3d late</span></div>
    </div>
    <div class="hero">
      <div class="herotop"><span class="heroeye">NEXT UP</span><span class="herobadge">TOMORROW</span></div>
      <div class="herotitle">Calc II · Problem Set 7</div>
      <div class="herosub">Wednesday, June 10 · 23:59</div>
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
    <div class="weekHi"><i class="fa">${I.flag}</i><span>Next exam: Biology 101 · Midterm — Fri, Jun 13 (4d) · start preparing</span></div>
  </div>
  ${tab('today')}</div>`;

// ---------- COURSE / GRADES ----------
const courseApp = `<div class="app">${SBAR}
  <div class="navbar"><span class="navback"><i class="fa">${I.chevL}</i> Back</span><span class="navtitle">Course</span><span style="width:48px"></span></div>
  <div class="appbody" style="padding:6px 20px 0">
    <div class="courseHead">
      <div class="courseIcon"><i class="fa">${I.book}</i></div>
      <div style="flex:1"><div class="courseName">Calc II</div><div class="courseInstr">Dr. Rivera</div></div>
      <div class="courseCounts"><span style="color:#BA7517;font-weight:700">3 pending</span><span class="cdotsep">·</span><span style="color:#0F6E56;font-weight:700">5 done</span></div>
    </div>
    <div class="gradeCard">
      <div class="gradeTop">
        <div><div class="gradeLbl">CURRENT GRADE</div><div class="gradePct">86.67%</div></div>
        <div class="gradeBadge">B</div>
      </div>
      <div class="gradeBarBg"><div class="gradeBarFill" style="width:86.67%"></div></div>
      <div class="gradeMeta"><span>3 of 5 graded</span><span class="gradeMetaR">45% of 60% attempted</span></div>
      <div class="gradeCtx">Based on 45% of coursework completed. Looking good!</div>
      <div class="whatif"><div class="whatifHead"><span class="whatifTitle">What do I need?</span><span class="proPill">PRO</span></div>
        <div class="whatifSub">See the exact average you need on your remaining 15% to land an A — computed from this course's real weights.</div></div>
    </div>
  </div>
  <div class="courseBar"><span class="cbItem"><i class="fa">${I.pencil}</i> Edit</span><span class="cbItem" style="color:#D85A30"><i class="fa">${I.trash}</i> Delete</span><span class="cbAdd"><i class="fa">${I.plus}</i> Add Task</span></div>
  </div>`;

// ---------- CALENDAR ----------
function calGrid() {
  const cells = [{ d: 31, out: true, wknd: true }];
  const dots = { 6: ['#10b981'], 10: ['#6366f1'], 13: ['#10b981'], 17: ['#6366f1', '#f59e0b'], 20: ['#10b981'], 24: ['#6366f1'] };
  const exam = { 13: true };
  for (let d = 1; d <= 30; d++) { const dow = d % 7; cells.push({ d, today: d === 9, wknd: dow === 0 || dow === 6, dots: dots[d], exam: exam[d] }); }
  [1, 2, 3, 4].forEach((d, i) => cells.push({ d, out: true, wknd: (5 + i) % 7 === 6 || (5 + i) % 7 === 0 }));
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
  <div class="appbody" style="padding:14px 18px 0">
    <div class="calheader">
      <div><div class="caltitle">Calendar</div><div class="monthrow"><span class="monthsub">June 2026</span><i class="fa" style="color:#8C8B94;font-size:12px">${I.caret}</i></div></div>
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

// ---------- ME / PRO ----------
const meApp = `<div class="app">${SBAR}
  <div class="appbody" style="padding:14px 20px 0">
    <div class="profileRow"><div class="avatar">R</div><div style="flex:1"><div class="profileName">Rajesh</div><div class="profileSub">Summer 2026</div></div></div>
    <div class="proCard">
      <div class="proGlow"></div>
      <div style="position:relative">
        <div class="proLabel"><i class="fa">${I.star}</i><span>SEMORA PRO</span></div>
        <div class="proTitle">Unlimited scans, smart plans, grade forecasts.</div>
        <div class="proPriceRow"><span class="proPriceAmt">$19.99</span><span class="proPricePer">/year · cancel any time</span></div>
        <div class="proBtn">Upgrade to Pro</div>
        <div class="proAlt">Or $3.99/month</div>
      </div>
    </div>
    <div class="statsGrid">
      <div class="statCard"><div class="statNum" style="color:#6B46C1">3</div><div class="statLabel">COURSES</div></div>
      <div class="statCard"><div class="statNum" style="color:#1C1B1F">12</div><div class="statLabel">DONE</div></div>
      <div class="statCard"><div class="statNum" style="color:#D85A30">4</div><div class="statLabel">PENDING</div></div>
    </div>
    <div class="settingsCard">
      <div class="settingsRow rowborder"><i class="fa setIc">${I.cog}</i><span class="setLbl">Settings</span><i class="fa chev">${I.chev}</i></div>
      <div class="settingsRow rowborder"><i class="fa setIc">${I.qcircle}</i><span class="setLbl">Help &amp; FAQ</span><i class="fa chev">${I.chev}</i></div>
      <div class="settingsRow"><i class="fa setIc">${I.starO}</i><span class="setLbl">Rate Semora</span><i class="fa chev">${I.chev}</i></div>
    </div>
  </div>
  ${tab('me')}</div>`;

const CSS = `
@font-face{font-family:'Fr7';src:url('${FR('700Bold/Fraunces_700Bold.ttf')}');}
@font-face{font-family:'Fr6';src:url('${FR('600SemiBold/Fraunces_600SemiBold.ttf')}');}
@font-face{font-family:'fa';src:url('${FA}');}
*{margin:0;padding:0;box-sizing:border-box;}
html,body{width:1024px;height:1366px;overflow:hidden;}
.fa{font-family:'fa';font-style:normal;font-weight:normal;line-height:1;-webkit-font-smoothing:antialiased;}
.stage{width:1024px;height:1366px;position:relative;overflow:hidden;background:${BG};}
.glow{position:absolute;width:760px;height:760px;border-radius:50%;right:-240px;top:-220px;background:radial-gradient(circle,rgba(255,255,255,0.13),rgba(255,255,255,0) 70%);}
.glow2{position:absolute;width:520px;height:520px;border-radius:50%;left:-200px;bottom:-180px;background:radial-gradient(circle,rgba(255,255,255,0.08),rgba(255,255,255,0) 70%);}
.cap{position:relative;text-align:center;padding:48px 60px 0;}
.capL1{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:-1px;line-height:0.98;text-shadow:0 3px 18px rgba(40,16,90,0.28);}
.capL2{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:0px;line-height:1.0;margin-top:6px;text-shadow:0 3px 18px rgba(40,16,90,0.28);}
.device{width:866px;margin:20px auto 0;background:#100F15;border-radius:46px;padding:15px;position:relative;box-shadow:0 46px 90px rgba(20,8,46,0.5),0 12px 30px rgba(20,8,46,0.32);}
.device::after{content:'';position:absolute;left:50%;top:7px;transform:translateX(-50%);width:7px;height:7px;border-radius:50%;background:#2b2a33;}
.screen{width:836px;height:1112px;overflow:hidden;border-radius:32px;background:#FAF9F5;position:relative;border:1px solid #000;}
.app{width:414px;height:551px;transform:scale(2.0193);transform-origin:top left;position:relative;background:#FAF9F5;font-family:-apple-system,'Helvetica Neue',sans-serif;}
.appbody{height:100%;}
.rowborder{border-top:.5px solid rgba(28,27,31,0.08);}
.chev{color:#8C8B94;font-size:12px;}
/* status bar */
.sbar{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 22px 0 24px;}
.sbar .t{font:600 15px -apple-system;color:#1C1B1F;letter-spacing:.3px;}
.sbar .r{display:flex;align-items:center;gap:7px;}
/* generic */
.h1{font-family:'Fr6';font-size:27px;color:#1C1B1F;letter-spacing:-.5px;}
.sub2{font:400 14px -apple-system;color:#55555C;margin-top:4px;line-height:1.36;}
.pill{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;margin-top:12px;font:600 13px -apple-system;}
.pill-brand{background:#EEEDFE;color:#6B46C1;}
.pill .fa{font-size:12px;}
.scanframe{background:#6B46C1;border-radius:22px;padding:22px;margin:16px 0;text-align:center;}
.corners{position:relative;height:104px;display:flex;align-items:center;justify-content:center;}
.cn{position:absolute;width:24px;height:24px;border:2.5px solid #fff;}
.tl{top:0;left:16px;border-right:0;border-bottom:0;border-top-left-radius:4px;}
.tr{top:0;right:16px;border-left:0;border-bottom:0;border-top-right-radius:4px;}
.bl{bottom:0;left:16px;border-right:0;border-top:0;border-bottom-left-radius:4px;}
.br{bottom:0;right:16px;border-left:0;border-top:0;border-bottom-right-radius:4px;}
.docmock{background:rgba(255,255,255,0.16);border-radius:6px;padding:12px;width:120px;display:flex;flex-direction:column;gap:5px;}
.ml{height:3px;border-radius:1.5px;background:rgba(255,255,255,0.5);}
.scanline{position:absolute;left:26px;right:26px;top:50%;height:2px;background:#FAC775;border-radius:1px;box-shadow:0 0 8px #FAC775;}
.framelabel{font:600 14px -apple-system;color:rgba(255,255,255,0.72);letter-spacing:.5px;margin-top:8px;}
.actions{display:flex;flex-direction:column;gap:8px;}
.actionCard{display:flex;align-items:center;gap:14px;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:14px;}
.actionIcon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
.ic-brand{background:#EEEDFE;color:#6B46C1;}.ic-coral{background:#FAECE7;color:#D85A30;}.ic-teal{background:#E1F5EE;color:#0F6E56;}.ic-blue{background:#E6F1FB;color:#185FA5;}
.actionTitle{font:500 14px -apple-system;color:#1C1B1F;}
.actionSub{font:400 14px -apple-system;color:#8C8B94;margin-top:2px;}
/* tab bar */
.tabbar{position:absolute;left:0;right:0;bottom:0;height:60px;display:flex;align-items:flex-start;justify-content:space-around;padding-top:7px;background:rgba(250,249,245,0.97);border-top:.5px solid rgba(28,27,31,0.08);}
.tab{display:flex;flex-direction:column;align-items:center;gap:2px;width:60px;}
.tab .iw{width:36px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;color:#8C8B94;}
.tab.active .iw{background:#EEEDFE;color:#6B46C1;}
.tab .lbl{font:500 10px -apple-system;color:#8C8B94;}
.tab.active .lbl{color:#6B46C1;}
.fab{width:44px;height:44px;border-radius:14px;background:#6B46C1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;margin-top:-6px;box-shadow:0 6px 14px rgba(107,70,193,0.4);}
.tab.scan .lbl{margin-top:4px;}
/* today */
.eyelabel{font:600 12px -apple-system;color:#8C8B94;letter-spacing:1px;}
.greeting{font-family:'Fr7';font-size:25px;color:#1C1B1F;margin-top:3px;letter-spacing:-.5px;}
.semlabel{font:400 13px -apple-system;color:#8C8B94;margin-top:2px;}
.secrow{margin:15px 0 8px;}
.sectitle{font:600 13px -apple-system;color:#55555C;letter-spacing:.5px;}
.sectitle.coral{color:#D85A30;}
.overdueCard{background:#FAECE7;border:1px solid #D85A30;border-radius:18px;padding:0 14px;}
.overdueRow{display:flex;align-items:center;gap:12px;padding:12px 0;}
.cbx{width:20px;height:20px;border-radius:7px;border:1.5px solid #8C8B94;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.cbx-coral{border-color:#D85A30;}
.cbx-done{background:#0F6E56;border-color:#0F6E56;color:#fff;font-size:9px;}
.taskTitle{font:500 14px -apple-system;color:#1C1B1F;}
.taskTitle.done{text-decoration:line-through;color:#8C8B94;}
.taskmeta{display:flex;align-items:center;gap:6px;margin-top:3px;}
.dot{width:7px;height:7px;border-radius:4px;}
.taskcourse{font:400 13px -apple-system;color:#8C8B94;}
.taskcourse.coral{color:#D85A30;}
.odbadge{background:#fff;border-radius:8px;padding:3px 8px;font:600 12px -apple-system;color:#D85A30;}
.hero{background:#6B46C1;border-radius:20px;padding:18px;margin-top:14px;overflow:hidden;position:relative;}
.herotop{display:flex;justify-content:space-between;align-items:center;}
.heroeye{font:800 12px -apple-system;color:rgba(255,255,255,0.88);letter-spacing:1.5px;}
.herobadge{background:rgba(255,255,255,0.22);border-radius:999px;padding:3px 11px;font:700 11px -apple-system;color:#fff;letter-spacing:.5px;}
.herotitle{font-family:'Fr7';font-size:21px;color:#fff;margin-top:10px;line-height:1.15;}
.herosub{font:400 14px -apple-system;color:rgba(255,255,255,0.8);margin-top:6px;}
.progressTrack{height:6px;border-radius:3px;background:rgba(28,27,31,0.08);margin-bottom:10px;overflow:hidden;}
.progressFill{height:100%;border-radius:3px;background:#6B46C1;}
.card{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:0 14px;}
.taskRow{display:flex;align-items:center;gap:12px;padding:12px 0;}
.weekHi{display:flex;align-items:center;gap:10px;margin-top:14px;padding:13px 14px;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:14px;}
.weekHi .fa{color:#D85A30;font-size:14px;flex-shrink:0;}
.weekHi span{font:500 13px -apple-system;color:#55555C;line-height:1.3;}
/* course */
.navbar{display:flex;align-items:center;justify-content:space-between;padding:2px 16px 8px;}
.navback{font:400 15px -apple-system;color:#6B46C1;}
.navtitle{font:600 16px -apple-system;color:#1C1B1F;}
.courseHead{display:flex;flex-direction:row;align-items:center;gap:14px;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:16px;margin-top:4px;}
.courseIcon{width:48px;height:48px;border-radius:14px;background:#EEEDFE;color:#6B46C1;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
.courseName{font-family:'Fr7';font-size:21px;color:#1C1B1F;letter-spacing:-.5px;}
.courseInstr{font:400 13px -apple-system;color:#8C8B94;margin-top:1px;}
.courseCounts{display:flex;align-items:center;gap:6px;font:400 12px -apple-system;flex-shrink:0;}
.cdotsep{color:#C9C8CE;}
.metaCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:0 14px;margin-top:12px;}
.metaRow{display:flex;align-items:center;gap:12px;padding:12px 0;}
.metaIc{color:#8C8B94;font-size:15px;width:18px;text-align:center;}
.metaT{font:600 13px -apple-system;color:#1C1B1F;}
.metaS{font:400 13px -apple-system;color:#8C8B94;margin-top:1px;}
.gradeCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:16px;margin-top:12px;}
.gradeTop{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;}
.gradeLbl{font:700 14px -apple-system;color:#8C8B94;letter-spacing:.5px;}
.gradePct{font-family:'Fr7';font-size:30px;color:#1C1B1F;margin-top:2px;}
.gradeBadge{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font:800 24px -apple-system;}
.gradeBarBg{height:8px;background:rgba(28,27,31,0.08);border-radius:4px;overflow:hidden;}
.gradeBarFill{height:8px;border-radius:4px;background:linear-gradient(90deg,#3b82f6,#2563eb);}
.gradeMeta{display:flex;justify-content:space-between;margin-top:6px;font:500 14px -apple-system;color:#8C8B94;}
.gradeMetaR{color:#55555C;}
.gradeCtx{background:#EEEDFE;border-radius:8px;padding:9px 10px;margin-top:8px;font:500 13px -apple-system;color:#6B46C1;line-height:1.35;}
.whatif{border-top:.5px solid rgba(28,27,31,0.08);margin-top:14px;padding-top:12px;}
.whatifHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;}
.whatifTitle{font-family:'Fr6';font-size:16px;color:#1C1B1F;}
.proPill{background:#6B46C1;color:#fff;border-radius:5px;padding:3px 7px;font:800 9px -apple-system;letter-spacing:.6px;}
.whatifSub{font:400 13px -apple-system;color:#8C8B94;line-height:1.4;}
.courseBar{position:absolute;left:0;right:0;bottom:0;height:54px;display:flex;align-items:center;justify-content:space-around;background:rgba(250,249,245,0.97);border-top:.5px solid rgba(28,27,31,0.08);}
.cbItem{font:500 14px -apple-system;color:#55555C;display:flex;align-items:center;gap:6px;}
.cbItem .fa{font-size:13px;}
.cbAdd{font:600 14px -apple-system;color:#fff;background:#6B46C1;border-radius:10px;padding:8px 14px;display:flex;align-items:center;gap:6px;}
.cbAdd .fa{font-size:12px;}
/* calendar */
.calheader{display:flex;justify-content:space-between;align-items:flex-end;}
.caltitle{font-family:'Fr6';font-size:27px;color:#1C1B1F;letter-spacing:-.5px;}
.monthrow{display:flex;align-items:center;gap:5px;margin-top:3px;}
.monthsub{font:500 14px -apple-system;color:#55555C;}
.modeToggle{display:flex;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:9px;padding:3px;}
.modeBtn{padding:5px 11px;border-radius:6px;font:500 13px -apple-system;color:#8C8B94;}
.modeBtn.active{background:#1C1B1F;color:#fff;}
.navrow{display:flex;justify-content:space-between;align-items:center;margin:14px 6px 12px;}
.navrow .ar{color:#6B46C1;font-size:14px;}
.todaylink{font:600 14px -apple-system;color:#6B46C1;}
.daylabels{display:flex;margin-bottom:6px;}
.daylabels span{flex:1;text-align:center;font:600 13px -apple-system;color:#8C8B94;letter-spacing:.6px;}
.grid{display:flex;flex-wrap:wrap;}
.cell{width:14.28%;display:flex;flex-direction:column;align-items:center;padding:3px 0;}
.dayInner{width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;font:400 14px -apple-system;color:#1C1B1F;}
.dayInner.out{color:#C9C8CE;}.dayInner.wknd{color:#8C8B94;}
.dayInner.today{background:#6B46C1;color:#fff;font-weight:600;}
.dayInner.exam{background:#EEEDFE;color:#6B46C1;font-weight:600;}
.cdots{display:flex;gap:2px;height:6px;margin-top:2px;justify-content:center;}
.cdot{width:4px;height:4px;border-radius:2px;}
.legend{display:flex;justify-content:center;gap:14px;margin:12px 0 14px;}
.legItem{display:flex;align-items:center;gap:5px;}
.legDot{width:7px;height:7px;border-radius:4px;}
.legText{font:400 12px -apple-system;color:#8C8B94;}
.agTitle{font:600 14px -apple-system;color:#55555C;margin-bottom:8px;}
.agCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:0 14px;}
.agRow{display:flex;align-items:center;gap:12px;padding:11px 0;}
.agTime{width:42px;text-align:center;}
.agTimeT{font:600 14px -apple-system;color:#D85A30;}
.agTimeD{font:400 11px -apple-system;color:#D85A30;}
.agBar{width:3px;align-self:stretch;border-radius:2px;min-height:30px;}
.agTaskT{font:500 14px -apple-system;color:#1C1B1F;}
.agTaskC{font:400 13px -apple-system;color:#8C8B94;margin-top:2px;}
/* me */
.profileRow{display:flex;align-items:center;gap:14px;padding:6px 0;margin-bottom:18px;}
.avatar{width:58px;height:58px;border-radius:29px;background:#6B46C1;color:#fff;display:flex;align-items:center;justify-content:center;font:600 22px -apple-system;}
.profileName{font-family:'Fr6';font-size:20px;color:#1C1B1F;}
.profileSub{font:400 14px -apple-system;color:#8C8B94;margin-top:2px;}
.proCard{background:#1C1B1F;border-radius:22px;padding:22px;margin-bottom:18px;overflow:hidden;position:relative;}
.proGlow{position:absolute;right:-30px;top:-30px;width:140px;height:140px;border-radius:70px;background:#6B46C1;opacity:.4;}
.proLabel{display:flex;align-items:center;gap:6px;margin-bottom:8px;}
.proLabel .fa{color:#CECBF6;font-size:11px;}
.proLabel span{font:800 12px -apple-system;color:#CECBF6;letter-spacing:1.5px;}
.proTitle{font-family:'Fr7';font-size:22px;color:#fff;line-height:1.27;max-width:250px;}
.proPriceRow{display:flex;align-items:baseline;gap:8px;margin-top:16px;}
.proPriceAmt{font:800 28px -apple-system;color:#fff;}
.proPricePer{font:400 14px -apple-system;color:rgba(255,255,255,0.6);}
.proBtn{background:#fff;color:#1C1B1F;border-radius:14px;padding:13px;text-align:center;font:700 15px -apple-system;margin-top:14px;}
.proAlt{font:400 13px -apple-system;color:rgba(255,255,255,0.5);text-align:center;margin-top:10px;}
.statsGrid{display:flex;gap:8px;margin-bottom:18px;}
.statCard{flex:1;background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:12px;text-align:center;}
.statNum{font:600 22px -apple-system;}
.statLabel{font:500 14px -apple-system;color:#8C8B94;letter-spacing:.5px;margin-top:2px;}
.settingsCard{background:#fff;border:.5px solid rgba(28,27,31,0.08);border-radius:18px;padding:0 14px;}
.settingsRow{display:flex;align-items:center;gap:12px;padding:13px 0;}
.setIc{color:#55555C;font-size:16px;width:18px;text-align:center;}
.setLbl{flex:1;font:400 14px -apple-system;color:#1C1B1F;}
`;

const page = (l1, l2, s1, s2, app) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="stage"><div class="glow"></div><div class="glow2"></div>
<div class="cap"><div class="capL1" style="font-size:${s1}px">${l1}</div><div class="capL2" style="font-size:${s2}px">${l2}</div></div>
<div class="device"><div class="screen">${app}</div></div>
</div></body></html>`;

const pages = [
  { f: 'screen-1.html', html: page('Scan', 'your syllabus', 90, 48, scanApp) },
  { f: 'screen-2.html', html: page('Never miss', 'a deadline', 60, 48, todayApp) },
  { f: 'screen-3.html', html: page('Track', 'your grades', 90, 48, courseApp) },
  { f: 'screen-4.html', html: page('Plan', 'your semester', 90, 48, calApp) },
  { f: 'screen-5.html', html: page('Go', 'Pro', 104, 60, meApp) },
];
pages.forEach((p) => fs.writeFileSync(path.join(OUT, p.f), p.html));
console.log('Wrote', pages.length, 'HTML files to', OUT);
