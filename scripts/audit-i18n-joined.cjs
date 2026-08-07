// Find JSX elements whose children are TEXT + inline string expressions.
// The localized Text wrapper joins those into ONE string before lookup, so the
// joined form is what must be in the dictionary — translating a fragment does
// nothing. This is how "Nothing pressing — you{'’'}re all caught up." stayed English.
const ts=require('typescript'), fs=require('fs'), path=require('path');
const os=require('os');
// Build the real runtime with the RN deps stubbed (same approach as
// audit-i18n-deep.cjs) so misses are judged by the production lookup.
const work=fs.mkdtempSync(path.join(os.tmpdir(),'i18n-join-'));
fs.writeFileSync(path.join(work,'expo-localization.js'),'exports.getLocales=()=>[{languageCode:"en"}];');
fs.writeFileSync(path.join(work,'appStore.js'),'exports.useAppStore={getState:()=>({languagePreference:"es",setLanguagePreference(){}})};');
const O={compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}};
const R=path.join(__dirname,'..');
fs.writeFileSync(path.join(work,'es.cjs'),ts.transpileModule(fs.readFileSync(path.join(R,'lib/i18n/es.ts'),'utf8'),O).outputText);
fs.writeFileSync(path.join(work,'runtime.cjs'),ts.transpileModule(
  fs.readFileSync(path.join(R,'lib/i18n.ts'),'utf8')
    .replace("from 'expo-localization'",`from '${path.join(work,'expo-localization.js')}'`)
    .replace("from '@/lib/i18n/es'",`from '${path.join(work,'es.cjs')}'`)
    .replace("from '@/store/appStore'",`from '${path.join(work,'appStore.js')}'`),O).outputText);
const {translate}=require(path.join(work,'runtime.cjs'));
const ROOT=path.join(__dirname,'..');
const files=[];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  if(e.name==='node_modules'||e.name.startsWith('.'))continue;
  const p=path.join(d,e.name);
  if(e.isDirectory())walk(p); else if(/\.tsx$/.test(e.name))files.push(p);}})(path.join(ROOT,'app'));
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){
  if(e.name==='node_modules'||e.name.startsWith('.'))continue;
  const p=path.join(d,e.name);
  if(e.isDirectory())walk(p); else if(/\.tsx$/.test(e.name))files.push(p);}})(path.join(ROOT,'components'));
const out=[];
for(const f of files){
  const sf=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const rel=path.relative(ROOT,f);
  (function visit(n){
    if(ts.isJsxElement(n)){
      const kids=n.children;
      const hasText=kids.some(k=>ts.isJsxText(k)&&k.text.trim());
      const hasStrExpr=kids.some(k=>ts.isJsxExpression(k)&&k.expression&&
        (ts.isStringLiteral(k.expression)||ts.isNoSubstitutionTemplateLiteral(k.expression)));
      if(hasText&&hasStrExpr){
        let joined='';let ok=true;
        for(const k of kids){
          if(ts.isJsxText(k)) joined+=k.text.replace(/\s*\n\s*/g,'');
          else if(ts.isJsxExpression(k)&&k.expression&&
                 (ts.isStringLiteral(k.expression)||ts.isNoSubstitutionTemplateLiteral(k.expression)))
            joined+=k.expression.text;
          else { ok=false; break; }
        }
        joined=joined.trim();
        if(ok&&joined.length>6&&/[a-zA-Z]{3}/.test(joined)&&translate(joined,'es')===joined){
          out.push([joined, `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line+1}`]);
        }
      }
    }
    ts.forEachChild(n,visit);
  })(sf);
}
console.log('joined-JSX strings still untranslated:', out.length);
for(const [s,loc] of out) console.log(`  ${JSON.stringify(s)}  @ ${loc}`);

// ── Pass 2: text interleaved with VALUE expressions ─────────────────────────
// Pass 1 only fires when one of the expressions is a string literal, which is
// the `{'’'}` apostrophe case it was written for. It therefore never looked at
// the far more common shape — text around a variable, as in
// `{gradedCount} of {totalCount} graded`. Those join into one string at runtime
// exactly the same way, so they need a PATTERN in spanishPattern() rather than
// a dictionary entry, and pass 1 reported "0 untranslated" while several were
// shipping in English.
//
// Values are probed with a number because that is what these expressions almost
// always are (counts, minutes, days). A hit here means: at the probe value, the
// runtime returns the input unchanged.
const PROBE='2';
const lit=e=>ts.isStringLiteral(e)||ts.isNoSubstitutionTemplateLiteral(e);
// A pluralising ternary (`{n !== 1 ? 's' : ''}`) is not an unknown value — both
// arms are known text. Probing it with a number produced "Found 2 deadline2!",
// which matches no pattern and got reported even though the real strings
// ("Found 1 deadline!" / "Found 10 deadlines!") translate fine. Take the plural
// arm so the probe reads like something the app actually renders.
function probeFor(e){
  if(lit(e)) return e.text;
  if(ts.isConditionalExpression(e)&&lit(e.whenTrue)&&lit(e.whenFalse))
    return e.whenTrue.text.length>=e.whenFalse.text.length ? e.whenTrue.text : e.whenFalse.text;
  return PROBE;
}
const out2=[];
for(const f of files){
  const sf=ts.createSourceFile(f,fs.readFileSync(f,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const rel=path.relative(ROOT,f);
  (function visit(n){
    if(ts.isJsxElement(n)){
      const kids=n.children.filter(k=>!(ts.isJsxText(k)&&!k.text.trim()));
      // Only the all-scalar case: the localized Text wrapper joins children into
      // one string solely when every child is a string or number. With a nested
      // element it translates each run separately, which is a different shape.
      const allScalar=kids.every(k=>ts.isJsxText(k)||ts.isJsxExpression(k));
      const hasValueExpr=kids.some(k=>ts.isJsxExpression(k)&&k.expression&&
        !ts.isStringLiteral(k.expression)&&!ts.isNoSubstitutionTemplateLiteral(k.expression));
      const words=kids.filter(ts.isJsxText).map(k=>k.text).join(' ');
      if(kids.length>1&&allScalar&&hasValueExpr&&/[a-zA-Z]{3}/.test(words)){
        let joined='';
        for(const k of kids){
          if(ts.isJsxText(k)) joined+=k.text.replace(/\s*\n\s*/g,'');
          else if(ts.isJsxExpression(k)&&k.expression) joined+=probeFor(k.expression);
        }
        joined=joined.replace(/\s+/g,' ').trim();
        if(joined.length>6&&translate(joined,'es')===joined){
          out2.push([joined, `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line+1}`]);
        }
      }
    }
    ts.forEachChild(n,visit);
  })(sf);
}
const seen=new Set();
const uniq=out2.filter(([s])=>!seen.has(s)&&seen.add(s));
console.log(`\ntext-around-a-value strings still untranslated (probe ${PROBE}): ${uniq.length}`);
for(const [s,loc] of uniq) console.log(`  ${JSON.stringify(s)}  @ ${loc}`);
process.exitCode = (out.length + uniq.length) ? 1 : 0;
