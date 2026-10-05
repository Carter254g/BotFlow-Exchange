/**
 * BotFlow Exchange web app.
 *
 * Talks to BOT Chain Testnet (chain ID 968) through the user's wallet and the public RPC.
 * Quotes come from the BDEX V3 Quoter; swaps go through the BDEX V3 SwapRouter.
 * Depends on ethers v6, loaded as a global from cdnjs in index.html.
 */
"use strict";

const CHAIN={id:968,hex:"0x3c8",name:"BOT Chain Testnet",rpc:"https://rpc.bohr.life",scan:"https://scan.bohr.life",faucet:"https://faucet.botchain.ai/basic",native:"tBOT"};
const ADDR={router:"0x07032d47A1b9f8460cBeE9dC17c1d3E438693929",quoter:"0x034A705b36067cff99ABf5C662Be881cBd8d0176"};
const WBOT="0xD5452816194a3784dBa983426cCe7c122F4abd30",USDT="0x75edC9335175Fc0552D51D48439F229c10420fe3";
const WK=WBOT.toLowerCase(),UK=USDT.toLowerCase();
const ERC20=["function balanceOf(address) view returns (uint256)","function decimals() view returns (uint8)","function symbol() view returns (string)","function allowance(address,address) view returns (uint256)","function approve(address,uint256) returns (bool)"];
const WABI=[...ERC20,"function deposit() payable","function withdraw(uint256)"];
const QABI=[
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)"];
const RABI=[
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)"];
const FEES=[3000,500,10000,100],HOP_FEES=[500,3000,10000],MIDS=[WBOT,USDT];
const GAS_RESERVE=ethers.parseEther("0.01"),UNWRAP_GAS=50000n,REFRESH_MS=15000;
const $=id=>document.getElementById(id);

const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const clamp=(v,lo,hi,d)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;

// Token registry. "BOT" is the native coin, every other key is a lowercase address.
const TK={BOT:{sym:CHAIN.native,d:18,native:true},[WK]:{sym:"WBOT",a:WBOT,d:18},[UK]:{sym:"USDT",a:USDT,d:6}};
for(const c of LS.get("bfx:tokens",[])){
  if(c&&typeof c.a==="string"&&ethers.isAddress(c.a)){const k=c.a.toLowerCase();if(!TK[k])TK[k]={sym:cleanSym(c.sym),a:ethers.getAddress(c.a),d:Number(c.d)||18,custom:true}}
}
let S={from:WK,to:UK,acct:null,prov:null,signer:null,ro:null,onChain:false,bal:{},q:null,fee:null,
  bps:clamp(+LS.get("bfx:slip",50),1,5000,50),dl:clamp(+LS.get("bfx:dl",20),1,180,20),
  approve:LS.get("bfx:approve","exact")==="max"?"max":"exact",busy:false,qid:0,timer:null,side:null};

function cleanSym(s){s=String(s||"").replace(/[^\w.\-+$]/g,"").slice(0,12);return s||"TOKEN"}
function el(tag,props,...kids){const e=document.createElement(tag);if(props)for(const[k,v]of Object.entries(props)){if(k==="on")for(const[ev,f]of Object.entries(v))e.addEventListener(ev,f);else if(k in e)e[k]=v;else e.setAttribute(k,v)}for(const c of kids)if(c!=null)e.append(c);return e}
function say(t,c,...extra){const m=$("msg");m.className=c||"";m.replaceChildren(typeof t==="string"?document.createTextNode(t):t,...extra)}
function fmt(v,d){const s=ethers.formatUnits(v,d);const[i,f=""]=s.split(".");const g=f.replace(/0+$/,"").slice(0,6);return g?i+"."+g:(i==="0"&&v>0n?"<0.000001":i)}
function short(a){return a.slice(0,6)+"…"+a.slice(-4)}
function pct(bps){return bps<1?"<0.01%":(bps/100).toFixed(2)+"%"}
function txLink(h,t){return el("a",{href:CHAIN.scan+"/tx/"+h,target:"_blank",rel:"noopener",textContent:t||"View transaction"})}
function under(k){return TK[k].native?WK:k}
function symOf(a){const t=TK[a.toLowerCase()];return t?t.sym:short(a)}
function kind(){if(S.from===S.to)return null;const f=under(S.from),t=under(S.to);if(f===t)return TK[S.from].native?"wrap":"unwrap";return "swap"}
function amountIn(){const v=$("amtA").value.trim();if(!v||isNaN(v)||+v<=0)return null;try{return ethers.parseUnits(v,TK[S.from].d)}catch(e){return null}}
function minOut(o){return o*BigInt(10000-S.bps)/10000n}
function readProv(){if(S.onChain&&S.prov)return S.prov;return S.ro||(S.ro=new ethers.JsonRpcProvider(CHAIN.rpc,CHAIN.id,{staticNetwork:true}))}

// Turn wallet and contract errors into something a user can act on
function errText(e){
  if(e&&(e.code==="ACTION_REJECTED"||e.code===4001||(e.info&&e.info.error&&e.info.error.code===4001)))return "You rejected the request in your wallet.";
  if(e&&e.message==="PRICE_MOVED")return "The price dropped below your minimum since the quote. Check the new quote and try again.";
  const s=[e&&e.shortMessage,e&&e.reason,e&&e.info&&e.info.error&&e.info.error.message,e&&e.message].filter(Boolean).join(" ");
  if(/Too little received/i.test(s))return "The price moved more than your slippage setting. Try again, or raise slippage in Settings.";
  if(/Transaction too old/i.test(s))return "The swap wasn't confirmed before its deadline. Try again, or allow more time in Settings.";
  if(/\bSTF\b|transfer amount exceeds/i.test(s))return "Token transfer failed. Check your balance and approval, then try again.";
  if(/insufficient funds/i.test(s))return "Not enough "+CHAIN.native+" to pay the network fee. Get free test tokens from the faucet: "+CHAIN.faucet;
  if(/nonce/i.test(s))return "Your wallet has another transaction waiting. Let it finish, then try again.";
  if(/network|timeout|failed to fetch|could not detect/i.test(s))return "Couldn't reach BOT Chain Testnet. Check your connection and try again.";
  return (e&&(e.shortMessage||e.reason||e.message))||"Transaction failed";
}

// ---------- Wallet ----------
async function connect(){
  if(!window.ethereum){say("No wallet found. Install MetaMask, OKX, Bitget or TokenPocket, or open this page in a wallet browser.","err");return}
  try{
    S.prov=new ethers.BrowserProvider(window.ethereum);
    await S.prov.send("eth_requestAccounts",[]);
    S.signer=await S.prov.getSigner();S.acct=await S.signer.getAddress();
    await checkChain();
    if(window.ethereum.on){window.ethereum.on("chainChanged",()=>location.reload());window.ethereum.on("accountsChanged",()=>location.reload())}
  }catch(e){say(errText(e),"err")}
  render();renderHist();checkPending();requote(true);
}
async function checkChain(){
  const net=await S.prov.getNetwork();S.onChain=Number(net.chainId)===CHAIN.id;
  if(S.onChain){await loadDecimals();await balances()}
}
async function switchChain(){
  try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:CHAIN.hex}]})}
  catch(e){
    if(e.code===4902||(e.data&&e.data.originalError&&e.data.originalError.code===4902)||/Unrecognized|not added/i.test(e.message||"")){
      await window.ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:CHAIN.hex,chainName:CHAIN.name,rpcUrls:[CHAIN.rpc],nativeCurrency:{name:CHAIN.native,symbol:CHAIN.native,decimals:18},blockExplorerUrls:[CHAIN.scan]}]});
    }else throw e;
  }
  location.reload();
}
async function loadDecimals(){try{TK[UK].d=Number(await new ethers.Contract(USDT,ERC20,readProv()).decimals())}catch(e){}}
async function balances(){
  if(!S.acct||!S.onChain)return;
  const p=readProv();
  await Promise.all(Object.keys(TK).map(async k=>{
    try{S.bal[k]=TK[k].native?await p.getBalance(S.acct):await new ethers.Contract(TK[k].a,ERC20,p).balanceOf(S.acct)}catch(e){S.bal[k]=null}
  }));
  render();
}
function watchAsset(k){const t=TK[k];if(!window.ethereum||t.native)return;
  window.ethereum.request({method:"wallet_watchAsset",params:{type:"ERC20",options:{address:t.a,symbol:t.sym,decimals:t.d}}}).catch(()=>{})}

// ---------- Routing ----------
function encPath(p,f){const ty=[],va=[];p.forEach((a,i)=>{ty.push("address");va.push(a);if(i<f.length){ty.push("uint24");va.push(f[i])}});return ethers.solidityPacked(ty,va)}
function candidates(tin,tout){
  const c=FEES.map(f=>({path:[tin,tout],fees:[f]}));
  for(const m of MIDS){
    const ml=m.toLowerCase();if(ml===tin.toLowerCase()||ml===tout.toLowerCase())continue;
    for(const f1 of HOP_FEES)for(const f2 of HOP_FEES)c.push({path:[tin,m,tout],fees:[f1,f2]});
  }
  return c;
}
async function quoteOn(qc,r,amt){
  if(r.path.length===2)return (await qc.quoteExactInputSingle.staticCall({tokenIn:r.path[0],tokenOut:r.path[1],amountIn:amt,fee:r.fees[0],sqrtPriceLimitX96:0}))[0];
  return (await qc.quoteExactInput.staticCall(encPath(r.path,r.fees),amt))[0];
}
async function findBest(a){
  const qc=new ethers.Contract(ADDR.quoter,QABI,readProv());
  let best=null,direct=null;
  await Promise.all(candidates(TK[under(S.from)].a,TK[under(S.to)].a).map(async r=>{
    try{const out=await quoteOn(qc,r,a);if(out<=0n)return;
      if(!best||out>best.out)best={...r,out};
      if(r.path.length===2&&(!direct||out>direct.out))direct={...r,out};
    }catch(e){}
  }));
  // A direct pool costs less gas, so prefer it unless a multi-hop route is more than 0.1% better
  if(best&&direct&&best!==direct&&direct.out*1001n>=best.out*1000n)best=direct;
  if(best){
    // Price impact: compare with the rate for a trade 1/1000th the size on the same route
    const ref=a/1000n>0n?a/1000n:1n;
    try{const r=await quoteOn(qc,best,ref);if(r>0n){const b=10000n-best.out*ref*10000n/(a*r);best.impact=Number(b<0n?0n:b)}}catch(e){}
  }
  return best;
}
function swapCall(a,mo,q){
  const r=new ethers.Contract(ADDR.router,RABI,S.signer),deadline=Math.floor(Date.now()/1000)+S.dl*60;
  if(q.path.length===2)return{c:r,fn:"exactInputSingle",args:{tokenIn:q.path[0],tokenOut:q.path[1],fee:q.fees[0],recipient:S.acct,deadline,amountIn:a,amountOutMinimum:mo,sqrtPriceLimitX96:0}};
  return{c:r,fn:"exactInput",args:{path:encPath(q.path,q.fees),recipient:S.acct,deadline,amountIn:a,amountOutMinimum:mo}};
}

function requote(silent){
  if(!silent){S.q=null;S.fee=null}
  clearTimeout(S.timer);syncURL();render();
  const a=amountIn(),k=kind();if(!a||!k)return;
  const id=++S.qid;
  if(k!=="swap"){estFee(a,k,id);return}
  S.timer=setTimeout(async()=>{
    const best=await findBest(a);
    if(id!==S.qid)return;
    S.q=best||{none:true};render();
    if(best)estFee(a,k,id);
  },silent?0:350);
}
async function estFee(a,k,id){
  if(!S.acct||!S.onChain)return;
  try{
    let gas;
    const w=new ethers.Contract(WBOT,WABI,S.signer);
    if(k==="wrap")gas=await w.deposit.estimateGas({value:a});
    else if(k==="unwrap")gas=await w.withdraw.estimateGas(a);
    else{
      if(TK[S.from].native||!S.q||S.q.none)return;
      const tin=new ethers.Contract(TK[under(S.from)].a,ERC20,readProv());
      if((await tin.allowance(S.acct,ADDR.router))<a)return;
      const{c,fn,args}=swapCall(a,minOut(S.q.out),S.q);
      gas=await c[fn].estimateGas(args);
      if(TK[S.to].native)gas+=UNWRAP_GAS;
    }
    const fd=await readProv().getFeeData(),gp=fd.gasPrice||fd.maxFeePerGas;
    if(!gp||id!==S.qid)return;
    S.fee=gas*gp;render();
  }catch(e){}
}

// ---------- UI ----------
function render(){
  const F=TK[S.from],O=TK[S.to],k=kind(),a=amountIn();
  $("symA").textContent=F.sym;$("symB").textContent=O.sym;
  const bA=S.bal[S.from],bB=S.bal[S.to];
  $("balA").textContent=bA==null?"–":fmt(bA,F.d);
  $("balB").textContent=bB==null?"–":fmt(bB,O.d);
  $("conn").textContent=S.acct?short(S.acct):"Connect wallet";
  $("slipV").textContent=(S.bps/100)+"%";$("slipV").className=S.bps>500?"v warn":"v";

  const R=$("rate"),RT=$("route"),I=$("impact"),M=$("minOut"),G=$("gasV");I.className="v";
  G.textContent=S.fee!=null?"≈ "+fmt(S.fee,18)+" "+CHAIN.native:(S.acct&&S.onChain&&a&&k?"Shown in your wallet":"–");
  if((k==="wrap"||k==="unwrap")&&a){
    $("amtB").value=fmt(a,O.d);R.textContent="1 "+F.sym+" = 1 "+O.sym;RT.textContent="Direct wrap, no pool fee";I.textContent="0%";M.textContent=fmt(a,O.d)+" "+O.sym;
  }else if(k==="swap"&&a&&S.q&&!S.q.none){
    $("amtB").value=fmt(S.q.out,O.d);
    R.textContent="1 "+F.sym+" ≈ "+fmt(S.q.out*(10n**BigInt(F.d))/a,O.d)+" "+O.sym;
    RT.textContent=S.q.path.map(symOf).join(" → ")+" ("+S.q.fees.map(f=>f/10000+"%").join(", ")+")";
    if(S.q.impact==null)I.textContent="–";else{I.textContent=pct(S.q.impact);if(S.q.impact>=1500)I.className="v bad";else if(S.q.impact>=300)I.className="v warn"}
    M.textContent=fmt(minOut(S.q.out),O.d)+" "+O.sym;
  }else{$("amtB").value="";R.textContent=RT.textContent=I.textContent=M.textContent="–"}

  const g=$("go");let txt,dis=true,danger=false;
  if(!S.acct)txt="Connect wallet",dis=false;
  else if(!S.onChain)txt="Switch to BOT Chain Testnet",dis=false;
  else if(S.busy)txt="Waiting for wallet…";
  else if(!k)txt="Choose two different tokens";
  else if(!a)txt="Enter an amount";
  else if(bA!=null&&a>bA)txt="Insufficient "+F.sym;
  else if(F.native&&bA!=null&&bA-a<GAS_RESERVE)txt="Keep 0.01 "+CHAIN.native+" for network fees";
  else if(k==="wrap")txt="Wrap "+CHAIN.native,dis=false;
  else if(k==="unwrap")txt="Unwrap WBOT",dis=false;
  else if(!S.q)txt="Finding best price…";
  else if(S.q.none)txt="No route found for this pair";
  else if(S.q.impact>=1500)txt="Swap anyway",dis=false,danger=true;
  else txt="Swap",dis=false;
  g.textContent=txt;g.disabled=dis;g.classList.toggle("danger",danger);
}

async function onGo(){
  if(!S.acct)return connect();
  if(!S.onChain){try{await switchChain()}catch(e){say(errText(e),"err")}return}
  const a=amountIn(),k=kind();if(!a||!k)return;
  if(k==="swap"&&(!S.q||S.q.none))return;
  if(k==="swap"&&S.q.impact>=1500&&!confirm("Price impact is "+pct(S.q.impact)+". You would get much less than the market rate. Swap anyway?"))return;
  const F=TK[S.from],O=TK[S.to],inTxt=fmt(a,F.d),outKey=S.to;
  S.busy=true;render();
  let wrapped=false,hash=null;
  try{
    const w=new ethers.Contract(WBOT,WABI,S.signer);
    let got;
    if(k==="wrap"||k==="unwrap"){
      say("Confirm "+(k==="wrap"?"wrapping "+CHAIN.native:"unwrapping WBOT")+" in your wallet…");
      const tx=k==="wrap"?await w.deposit({value:a}):await w.withdraw(a);hash=tx.hash;
      logTx({t:Date.now(),h:hash,verb:k==="wrap"?"Wrapped":"Unwrapped",i:inTxt+" "+F.sym,o:inTxt+" "+O.sym,st:"pending"});
      say("Submitted. Waiting for confirmation…");
      const rc=await tx.wait();if(rc.status!==1)throw new Error("Transaction failed on chain");got=a;
    }else{
      const inA=TK[under(S.from)].a,outA=TK[under(S.to)].a;
      const tin=new ethers.Contract(inA,ERC20,S.signer),tout=new ethers.Contract(outA,ERC20,readProv());
      const needAp=(await tin.allowance(S.acct,ADDR.router))<a;
      const total=1+(F.native?1:0)+(needAp?1:0)+(O.native?1:0);let n=0;
      const step=t=>say(t+" in your wallet ("+(++n)+" of "+total+")…");
      if(F.native){step("Confirm wrapping "+CHAIN.native);const t=await w.deposit({value:a});await t.wait();wrapped=true}
      if(needAp){step("Approve "+symOf(inA));const t=await tin.approve(ADDR.router,S.approve==="max"?ethers.MaxUint256:a);await t.wait()}
      // Re-check the price right before signing so a stale quote can't slip through
      say("Checking the latest price…");
      const qc=new ethers.Contract(ADDR.quoter,QABI,readProv());
      const fresh=await quoteOn(qc,S.q,a).catch(()=>0n);
      if(fresh<minOut(S.q.out)){S.q={...S.q,out:fresh};throw new Error("PRICE_MOVED")}
      const q={...S.q,out:fresh},{c,fn,args}=swapCall(a,minOut(fresh),q);
      await c[fn].staticCall(args); // simulate first, so a failing swap never costs gas
      const before=await tout.balanceOf(S.acct);
      step("Confirm the swap");
      const tx=await c[fn](args);hash=tx.hash;
      logTx({t:Date.now(),h:hash,verb:"Swapped",i:inTxt+" "+F.sym,o:"~"+fmt(fresh,O.d)+" "+O.sym,st:"pending"});
      say("Swap submitted. Waiting for confirmation…");
      const rc=await tx.wait();if(rc.status!==1)throw new Error("Transaction failed on chain");
      got=(await tout.balanceOf(S.acct))-before;if(got<0n)got=0n;
      if(O.native&&got>0n){step("Confirm unwrapping WBOT");const t=await w.withdraw(got);await t.wait()}
    }
    updTx(hash,{st:"done",o:fmt(got,O.d)+" "+O.sym});
    const verb=k==="wrap"?"Wrapped":k==="unwrap"?"Unwrapped":"Swapped";
    const extra=[txLink(hash)];
    if(!O.native&&window.ethereum)extra.push(el("button",{className:"link",textContent:"Add "+O.sym+" to wallet",on:{click:()=>watchAsset(outKey)}}));
    say(verb+" "+inTxt+" "+F.sym+" for "+fmt(got,O.d)+" "+O.sym+". ","ok",...extra);
    $("amtA").value="";S.q=null;S.fee=null;
  }catch(e){
    if(hash)updTx(hash,{st:"failed"});
    let t=errText(e);if(wrapped)t+=" Your "+CHAIN.native+" was wrapped to WBOT, which you can swap or unwrap any time.";
    say(t,"err");
  }
  S.busy=false;await balances();requote(true);
}

// ---------- Recent activity (per wallet, this browser only) ----------
function histKey(){return "bfx:tx:"+(S.acct||"").toLowerCase()}
function logTx(x){const l=LS.get(histKey(),[]);l.unshift(x);LS.set(histKey(),l.slice(0,10));renderHist()}
function updTx(h,p){const l=LS.get(histKey(),[]);const x=l.find(y=>y.h===h);if(x){Object.assign(x,p);LS.set(histKey(),l);renderHist()}}
function renderHist(){
  const l=S.acct?LS.get(histKey(),[]):[];
  $("hist").hidden=!l.length;
  $("histL").replaceChildren(...l.map(x=>el("li",null,
    el("span",null,x.verb+" "+x.i+" for "+x.o+" ",x.st==="pending"?el("span",{className:"st pending",textContent:"Pending"}):x.st==="failed"?el("span",{className:"st failed",textContent:"Failed"}):null),
    el("span",{className:"lbl"},new Date(x.t).toLocaleString()+" ",txLink(x.h,"View"))
  )));
}
// If the page was closed while a transaction was pending, find out what happened to it
async function checkPending(){
  if(!S.acct)return;
  const l=LS.get(histKey(),[]);let changed=false;
  await Promise.all(l.filter(x=>x.st==="pending").map(async x=>{
    try{const r=await readProv().getTransactionReceipt(x.h);if(r){x.st=r.status===1?"done":"failed";changed=true}}catch(e){}
  }));
  if(changed){LS.set(histKey(),l);renderHist()}
}

// ---------- Token picker ----------
function openPick(side){S.side=side;$("pickQ").value="";renderPick();$("pick").showModal();$("pickQ").focus()}
function choose(k){
  if(S.side==="A"){if(k===S.to)S.to=S.from;S.from=k}else{if(k===S.from)S.from=S.to;S.to=k}
  $("pick").close();requote();
}
function saveCustom(){LS.set("bfx:tokens",Object.values(TK).filter(t=>t.custom).map(t=>({a:t.a,sym:t.sym,d:t.d})))}
function renderPick(){
  const q=$("pickQ").value.trim().toLowerCase(),cur=S.side==="A"?S.from:S.to;
  const keys=Object.keys(TK).filter(k=>!q||TK[k].sym.toLowerCase().includes(q)||k===q);
  $("pickL").replaceChildren(...keys.map(k=>{
    const t=TK[k],b=S.bal[k];
    const li=el("li",null,el("button",{className:"opt","aria-current":String(k===cur),on:{click:()=>choose(k)}},
      el("span",null,el("b",{textContent:t.sym}),el("small",{textContent:t.native?"Native coin":(t.custom?"Imported, ":"")+short(t.a)})),
      el("span",{className:"lbl",textContent:b==null?"":fmt(b,t.d)})));
    if(t.custom)li.append(el("button",{className:"rm",textContent:"Remove","aria-label":"Remove "+t.sym,on:{click:()=>{
      if(S.from===k)S.from=WK;if(S.to===k)S.to=UK;if(S.from===S.to)S.to=S.from===UK?WK:UK;
      delete TK[k];delete S.bal[k];saveCustom();renderPick();requote()}}}));
    return li;
  }));
  const m=$("pickM");m.replaceChildren();
  if(ethers.isAddress(q)&&!TK[q]){
    m.append(el("div",{className:"imp"},
      el("span",null,"This token isn't on the list. Anyone can create a token with any name, so check the address on the ",el("a",{href:CHAIN.scan+"/address/"+q,target:"_blank",rel:"noopener",textContent:"BOT Chain explorer"})," before you trade it."),
      el("button",{textContent:"Import token",on:{click:()=>importTok(q)}})));
  }else if(!keys.length)m.append(el("p",{className:"lbl",textContent:"No match. Paste the token's contract address to import it."}));
}
async function importTok(addr){
  const m=$("pickM");m.replaceChildren(el("p",{className:"lbl",textContent:"Reading token from BOT Chain Testnet…"}));
  try{
    const c=new ethers.Contract(addr,ERC20,readProv());
    const[sym,d]=await Promise.all([c.symbol(),c.decimals()]);
    if(Number(d)>36)throw new Error("bad decimals");
    const k=addr.toLowerCase();TK[k]={sym:cleanSym(sym),a:ethers.getAddress(addr),d:Number(d),custom:true};
    saveCustom();choose(k);balances();
  }catch(e){m.replaceChildren(el("p",{className:"lbl",textContent:"No token contract found at this address on BOT Chain Testnet."}))}
}

// ---------- Approvals manager ----------
async function renderApr(){
  const L=$("aprL"),M=$("aprM");L.replaceChildren();
  if(!S.acct||!S.onChain){M.textContent="Connect your wallet on BOT Chain Testnet to see approvals.";return}
  M.textContent="Checking approvals…";
  const rows=[];
  await Promise.all(Object.keys(TK).filter(k=>!TK[k].native).map(async k=>{
    try{const v=await new ethers.Contract(TK[k].a,ERC20,readProv()).allowance(S.acct,ADDR.router);if(v>0n)rows.push([k,v])}catch(e){}
  }));
  M.textContent=rows.length?"":"The router can't spend any of your listed tokens.";
  L.replaceChildren(...rows.map(([k,v])=>{
    const t=TK[k];
    const btn=el("button",{className:"rm strong",textContent:"Revoke",on:{click:async()=>{
      btn.disabled=true;btn.textContent="Confirm in wallet…";
      try{const tx=await new ethers.Contract(t.a,ERC20,S.signer).approve(ADDR.router,0);btn.textContent="Revoking…";await tx.wait();renderApr()}
      catch(e){btn.disabled=false;btn.textContent="Revoke";M.textContent=errText(e)}
    }}});
    return el("li",null,el("span",{className:"opt"},el("span",null,el("b",{textContent:t.sym}),el("small",{textContent:v>=ethers.MaxUint256/2n?"Unlimited":fmt(v,t.d)+" "+t.sym}))),btn);
  }));
}

// ---------- Settings ----------
function renderSet(){
  [...$("slip").querySelectorAll("button")].forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.b===S.bps)));
  if([10,50,100].includes(S.bps))$("slipC").value="";
  $("slipW").textContent=S.bps<5?"Very low slippage. Your swap may fail if the price moves at all.":S.bps>500?"High slippage. You could receive much less than the quote.":"";
  [...$("apv").children].forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.v===S.approve)));
  $("dl").value=S.dl;
}
function setSlip(b){S.bps=clamp(b,1,5000,50);LS.set("bfx:slip",S.bps);renderSet();render()}

// ---------- Shareable links: ?from=BOT&to=USDT&amount=10 ----------
function tokParam(k){return TK[k].native?"BOT":TK[k].custom?TK[k].a:TK[k].sym}
function syncURL(){try{const u=new URL(location.href);u.searchParams.set("from",tokParam(S.from));u.searchParams.set("to",tokParam(S.to));const v=$("amtA").value.trim();if(v)u.searchParams.set("amount",v);else u.searchParams.delete("amount");history.replaceState(null,"",u)}catch(e){}}
function resolveTok(v){if(!v)return null;if(v.toUpperCase()==="BOT"||v.toUpperCase()==="TBOT")return "BOT";const l=v.toLowerCase();if(TK[l])return l;for(const k in TK)if(!TK[k].custom&&TK[k].sym.toLowerCase()===l)return k;return ethers.isAddress(v)?"?":null}
function loadURL(){
  const p=new URLSearchParams(location.search),f=resolveTok(p.get("from")),t=resolveTok(p.get("to"));
  if(f==="?"||t==="?")say("This link uses a token that isn't on your list. Check it on the explorer, then paste its address into the token picker to import it.");
  if(f&&f!=="?")S.from=f;if(t&&t!=="?")S.to=t;if(S.from===S.to)S.to=S.from===UK?WK:UK;
  const a=p.get("amount");if(a&&/^\d*\.?\d+$/.test(a))$("amtA").value=a;
}

// ---------- Wiring ----------
$("conn").onclick=connect;
$("go").onclick=onGo;
$("amtA").oninput=()=>requote();
$("symA").onclick=()=>openPick("A");
$("symB").onclick=()=>openPick("B");
$("pickQ").oninput=renderPick;
$("setB").onclick=()=>{renderSet();$("set").showModal()};
$("aprB").onclick=()=>{$("apr").showModal();renderApr()};
document.querySelectorAll("dialog").forEach(d=>{d.addEventListener("click",e=>{if(e.target===d||e.target.closest("[data-close]"))d.close()})});
$("flip").onclick=()=>{[S.from,S.to]=[S.to,S.from];$("amtA").value="";requote()};
$("max").onclick=()=>{let b=S.bal[S.from];if(b==null)return;if(TK[S.from].native)b=b>GAS_RESERVE?b-GAS_RESERVE:0n;$("amtA").value=ethers.formatUnits(b,TK[S.from].d);requote()};
$("slip").onclick=e=>{const b=e.target.closest("button");if(b)setSlip(+b.dataset.b)};
$("slipC").oninput=()=>{const v=parseFloat($("slipC").value);if(v>0&&v<=50)setSlip(Math.max(1,Math.round(v*100)))};
$("dl").oninput=()=>{const v=parseInt($("dl").value,10);if(v>=1&&v<=180){S.dl=v;LS.set("bfx:dl",v)}};
$("apv").onclick=e=>{const b=e.target.closest("button");if(!b)return;S.approve=b.dataset.v;LS.set("bfx:approve",S.approve);renderSet()};
$("histClr").onclick=()=>{LS.set(histKey(),[]);renderHist()};
$("share").onclick=()=>{syncURL();const u=location.href;
  (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(()=>say("Link copied. Anyone who opens it sees this swap filled in.","ok")).catch(()=>say("Copy this link: "+u))};
// Keep quotes fresh while the page is open and idle
setInterval(()=>{if(!S.busy&&document.visibilityState==="visible"&&kind()==="swap"&&amountIn()&&S.q&&!document.querySelector("dialog[open]"))requote(true)},REFRESH_MS);

loadURL();renderSet();requote();
if(window.ethereum&&window.ethereum.selectedAddress){connect()}
