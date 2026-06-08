import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, writeBatch, getDocs as firestoreGetDocs } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ========== 🔥 REPLACE WITH YOUR OWN FIREBASE CONFIG ==========
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCw3oFnB_jUtSLVSJ3BnyGAG8UHqY7dyQ0",
  authDomain: "nabore-bookshop.firebaseapp.com",
  databaseURL: "https://nabore-bookshop-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "nabore-bookshop",
  storageBucket: "nabore-bookshop.firebasestorage.app",
  messagingSenderId: "619207980890",
  appId: "1:619207980890:web:c680907f519b3d6efa2563",
  measurementId: "G-YKNGLT2VLT"
};
// ================================================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const loginDiv = document.getElementById('loginContainer');
const mainDiv = document.getElementById('mainContent');
const authError = document.getElementById('authErrorMsg');
const authSuccess = document.getElementById('authSuccessMsg');

let products = [], stockItems = [], expenses = [], transactions = [], salesHistory = [];
let editingProductId = null, editingStockId = null;
let cart = [];
let trendChart = null, pieChart = null;
let geminiApiKey = localStorage.getItem('geminiApiKey') || '';

function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2500); }
function formatKES(v) { return `KES ${v.toFixed(2)}`; }
function escapeHtml(str) { return String(str).replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }

// ========== AUTH HANDLER ==========
async function handleAuth(action, email, password, button) {
    if (!email || !password) {
        authError.innerText = "❌ Please enter both email and password.";
        return false;
    }
    const originalText = button.innerText;
    button.disabled = true;
    button.innerText = "Loading...";
    authError.innerText = "";
    authSuccess.innerText = "";
    try {
        if (action === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
            authSuccess.innerText = "✅ Login successful! Redirecting...";
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
            authSuccess.innerText = "✅ Account created! Redirecting...";
        }
        return true;
    } catch (error) {
        let friendlyMessage = error.message;
        switch (error.code) {
            case 'auth/invalid-email': friendlyMessage = "❌ Invalid email format."; break;
            case 'auth/user-not-found': friendlyMessage = "❌ No account found. Please sign up first."; break;
            case 'auth/wrong-password': friendlyMessage = "❌ Incorrect password."; break;
            case 'auth/email-already-in-use': friendlyMessage = "❌ Email already registered. Try logging in."; break;
            case 'auth/weak-password': friendlyMessage = "❌ Password should be at least 6 characters."; break;
            case 'auth/configuration-not-found': friendlyMessage = "❌ Enable Email/Password in Firebase Console → Authentication."; break;
            case 'auth/network-request-failed': friendlyMessage = "❌ Network error. Check your internet connection."; break;
            default: friendlyMessage = `❌ ${error.message}`;
        }
        authError.innerText = friendlyMessage;
        return false;
    } finally {
        button.disabled = false;
        button.innerText = originalText;
    }
}

document.getElementById('loginBtn').onclick = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    await handleAuth('login', email, password, document.getElementById('loginBtn'));
};
document.getElementById('signupBtn').onclick = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    await handleAuth('signup', email, password, document.getElementById('signupBtn'));
};
document.getElementById('logoutMainBtn').onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
    if (user) {
        loginDiv.style.display = 'none';
        mainDiv.style.display = 'block';
        initApp();
    } else {
        loginDiv.style.display = 'block';
        mainDiv.style.display = 'none';
        authError.innerText = "";
        authSuccess.innerText = "";
    }
});

// ========== PRODUCTS & SERVICES ==========
async function renderProducts() {
    const tbody = document.getElementById('productsTableBody');
    if (!products.length) { tbody.innerHTML = '<tr><td colspan="5">No products/services</td></tr>'; return; }
    let html = '';
    products.forEach(p => {
        const buying = p.buyingPrice || 0;
        const selling = p.sellingPrice || p.price || 0;
        html += `<tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.type)}</td>
            <td>${formatKES(buying)}</td>
            <td>${formatKES(selling)}</td>
            <td><button class="editProduct" data-id="${p.id}">✏️ Edit</button> <button class="deleteProduct" data-id="${p.id}" style="background:#b91c1c;">🗑️ Delete</button></td>
        </tr>`;
    });
    tbody.innerHTML = html;
    document.querySelectorAll('.editProduct').forEach(btn => btn.addEventListener('click', (e) => editProduct(btn.dataset.id)));
    document.querySelectorAll('.deleteProduct').forEach(btn => btn.addEventListener('click', async () => { if(confirm("Delete?")) await deleteDoc(doc(db,"products",btn.dataset.id)); showToast("Deleted"); }));
}
async function editProduct(id) { const p = products.find(p => p.id === id); if(p) { editingProductId = id; document.getElementById('prodName').value = p.name; document.getElementById('prodType').value = p.type; document.getElementById('prodBuyingPrice').value = p.buyingPrice || 0; document.getElementById('prodSellingPrice').value = p.sellingPrice || p.price || 0; document.getElementById('prodEditId').innerText = `Editing: ${p.name}`; } }
document.getElementById('addProductBtn').onclick = async () => { const name = document.getElementById('prodName').value.trim(); const type = document.getElementById('prodType').value; const buyingPrice = parseFloat(document.getElementById('prodBuyingPrice').value) || 0; const sellingPrice = parseFloat(document.getElementById('prodSellingPrice').value); if (!name || isNaN(sellingPrice) || sellingPrice <= 0) { showToast("Valid name & selling price required"); return; } await addDoc(collection(db, "products"), { name, type, buyingPrice, sellingPrice, createdAt: new Date() }); showToast("✅ Product added"); clearProductForm(); };
document.getElementById('updateProductBtn').onclick = async () => { if(!editingProductId) { showToast("No product selected"); return; } const name = document.getElementById('prodName').value.trim(); const type = document.getElementById('prodType').value; const buyingPrice = parseFloat(document.getElementById('prodBuyingPrice').value) || 0; const sellingPrice = parseFloat(document.getElementById('prodSellingPrice').value); if (!name || isNaN(sellingPrice) || sellingPrice <= 0) return; await updateDoc(doc(db,"products",editingProductId), { name, type, buyingPrice, sellingPrice, updatedAt: new Date() }); showToast("✅ Updated"); clearProductForm(); };
function clearProductForm() { document.getElementById('prodName').value = ''; document.getElementById('prodBuyingPrice').value = ''; document.getElementById('prodSellingPrice').value = ''; editingProductId = null; document.getElementById('prodEditId').innerText = ''; }
document.getElementById('cancelProductEdit').onclick = clearProductForm;

// ========== STOCK ==========
async function renderStock() {
    const tbody = document.getElementById('stockTableBody');
    if(!stockItems.length) { tbody.innerHTML = '<tr><td colspan="5">No stock items</td></tr>'; document.getElementById('lowStockList').innerHTML = '<p>No low stock items.</p>'; return; }
    let html = '', lowHtml = '<ul>';
    stockItems.forEach(item => {
        const isLow = item.quantity <= item.lowThreshold;
        if(isLow) lowHtml += `<li>${escapeHtml(item.name)} (${item.quantity} left, below ${item.lowThreshold})</li>`;
        html += `<tr>
            <td>${escapeHtml(item.name)}</td>
            <td class="${isLow?'low-stock':''}">${item.quantity}</td>
            <td>${formatKES(item.price)}</td>
            <td>${item.lowThreshold}</td>
            <td><button class="editStock" data-id="${item.id}">✏️</button> <button class="deleteStock" data-id="${item.id}" style="background:#b91c1c;">🗑️</button></td>
        </tr>`;
    });
    lowHtml += '</ul>';
    tbody.innerHTML = html;
    document.getElementById('lowStockList').innerHTML = lowHtml;
    document.querySelectorAll('.editStock').forEach(btn => btn.addEventListener('click', () => editStock(btn.dataset.id)));
    document.querySelectorAll('.deleteStock').forEach(btn => btn.addEventListener('click', async () => { if(confirm("Delete stock?")) await deleteDoc(doc(db,"stock",btn.dataset.id)); }));
}
async function editStock(id) { const item = stockItems.find(i => i.id === id); if(item) { editingStockId = id; document.getElementById('stockName').value = item.name; document.getElementById('stockQty').value = item.quantity; document.getElementById('stockPrice').value = item.price; document.getElementById('stockThreshold').value = item.lowThreshold; document.getElementById('stockEditId').innerText = `Editing: ${item.name}`; } }
document.getElementById('addStockBtn').onclick = async () => { const name = document.getElementById('stockName').value.trim(); if(!name) return; const qty = parseInt(document.getElementById('stockQty').value)||0; const price = parseFloat(document.getElementById('stockPrice').value)||0; const thresh = parseInt(document.getElementById('stockThreshold').value)||5; await addDoc(collection(db,"stock"),{name,quantity:qty,price,lowThreshold:thresh}); showToast("Stock added"); clearStockForm(); };
document.getElementById('updateStockBtn').onclick = async () => { if(!editingStockId) return; const name = document.getElementById('stockName').value.trim(); const qty = parseInt(document.getElementById('stockQty').value); const price = parseFloat(document.getElementById('stockPrice').value); const thresh = parseInt(document.getElementById('stockThreshold').value); await updateDoc(doc(db,"stock",editingStockId),{name,quantity:qty,price,lowThreshold:thresh}); showToast("Stock updated"); clearStockForm(); };
function clearStockForm() { document.getElementById('stockName').value = ''; document.getElementById('stockQty').value = 0; document.getElementById('stockPrice').value = ''; editingStockId = null; document.getElementById('stockEditId').innerText = ''; }
document.getElementById('cancelStockEdit').onclick = clearStockForm;
document.getElementById('exportStockCsvBtn').onclick = () => { if(!stockItems.length) return; const headers = ["Name","Quantity","Price (KES)","Low Threshold"]; const rows = stockItems.map(i=>[i.name,i.quantity,i.price,i.lowThreshold]); const csv = [headers,...rows].map(r=>r.join(",")).join("\n"); const blob = new Blob([csv],{type:"text/csv"}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Stock_${Date.now()}.csv`; a.click(); showToast("CSV exported"); };

// ========== EXPENSES ==========
let expenseYear = "all", expenseMonth = "all";
function loadExpensesWithFilters() { let filtered = [...expenses]; if(expenseYear !== "all") filtered = filtered.filter(e=>e.date.startsWith(expenseYear)); if(expenseMonth !== "all") filtered = filtered.filter(e=>new Date(e.date).getMonth()+1 === parseInt(expenseMonth)); renderExpensesTable(filtered); updateExpenseFiltersUI(); }
function renderExpensesTable(data) { const tbody = document.getElementById('expensesTableBody'); if(!data.length){tbody.innerHTML='<tr><td colspan="5">No expenses recorded</td></tr>';return;} let html=''; data.forEach(exp=>{html+=`<tr>
        <td>${exp.date}</td>
        <td>${escapeHtml(exp.category)}</td>
        <td>${formatKES(exp.amount)}</td>
        <td>${escapeHtml(exp.description||'-')}</td>
        <td><button class="deleteExpense" data-id="${exp.id}" style="background:#b91c1c;">🗑️</button></td>
    </tr>`;}); tbody.innerHTML=html; document.querySelectorAll('.deleteExpense').forEach(btn=>btn.addEventListener('click',async()=>{if(confirm("Delete expense?")) await deleteDoc(doc(db,"expenses",btn.dataset.id));})); }
function updateExpenseFiltersUI() { const years=[...new Set(expenses.map(e=>e.date.split('-')[0]))].sort(); const ySel=document.getElementById('expenseYearFilter'); ySel.innerHTML='<option value="all">All Years</option>'; years.forEach(y=>ySel.innerHTML+=`<option value="${y}">${y}</option>`); ySel.value=expenseYear; const mSel=document.getElementById('expenseMonthFilter'); mSel.innerHTML='<option value="all">All Months</option>'; for(let i=1;i<=12;i++)mSel.innerHTML+=`<option value="${i}">${i}</option>`; mSel.value=expenseMonth; }
document.getElementById('expenseYearFilter').onchange=e=>{expenseYear=e.target.value; loadExpensesWithFilters();};
document.getElementById('expenseMonthFilter').onchange=e=>{expenseMonth=e.target.value; loadExpensesWithFilters();};
document.getElementById('resetExpenseFilters').onclick=()=>{expenseYear="all";expenseMonth="all";loadExpensesWithFilters();};
document.getElementById('addExpenseBtn').onclick=async()=>{const date=document.getElementById('expenseDate').value;if(!date)return;const category=document.getElementById('expenseCategory').value.trim();const amount=parseFloat(document.getElementById('expenseAmount').value);const desc=document.getElementById('expenseDesc').value;if(!category||isNaN(amount))return;await addDoc(collection(db,"expenses"),{date,category,amount,description:desc});document.getElementById('expenseDate').valueAsDate=new Date();document.getElementById('expenseCategory').value='';document.getElementById('expenseAmount').value='';document.getElementById('expenseDesc').value='';showToast("Expense added");};
document.getElementById('exportExpensesCsv').onclick=()=>{if(!expenses.length)return;const headers=["Date","Category","Amount","Description"];const rows=expenses.map(e=>[e.date,e.category,e.amount,e.description]);const csv=[headers,...rows].map(r=>r.join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv"});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Expenses_${Date.now()}.csv`;a.click();};

// ========== POS ==========
function refreshProductSelect() {
    const select = document.getElementById('posProductSelect');
    select.innerHTML = '<option value="">-- Select product/service --</option>';
    products.forEach(p => {
        const selling = p.sellingPrice || p.price || 0;
        select.innerHTML += `<option value="${p.id}" data-selling="${selling}" data-buying="${p.buyingPrice||0}" data-type="${p.type}" data-name="${p.name}">${escapeHtml(p.name)} (${p.type}) - ${formatKES(selling)}</option>`;
    });
}
document.getElementById('posProductSelect').addEventListener('change',(e)=>{ const opt = e.target.selectedOptions[0]; if(opt && opt.value){ document.getElementById('posPrice').value = parseFloat(opt.dataset.selling); document.getElementById('posCustomName').value = opt.dataset.name; } else { document.getElementById('posPrice').value = ''; } });
function addToCart() {
    const select = document.getElementById('posProductSelect');
    let name = document.getElementById('posCustomName').value.trim();
    let productId = null;
    let sellingPrice = parseFloat(document.getElementById('posPrice').value);
    let buyingPrice = 0;
    let type = 'Product';
    if(select.value) { const selected = products.find(p=>p.id===select.value); if(selected){ name = selected.name; sellingPrice = selected.sellingPrice || selected.price || 0; buyingPrice = selected.buyingPrice || 0; type = selected.type; productId = selected.id; } }
    if(!name){ alert("Enter item name"); return; }
    if(isNaN(sellingPrice)||sellingPrice<=0){ alert("Valid selling price required"); return; }
    const qty = parseInt(document.getElementById('posQty').value);
    if(isNaN(qty)||qty<1) return;
    if(type==="Product" && productId){ const stockItem = stockItems.find(s=>s.name.toLowerCase()===name.toLowerCase()); if(stockItem && stockItem.quantity < qty){ alert(`Insufficient stock: only ${stockItem.quantity} left`); return; } }
    cart.push({name, qty, sellingPrice, buyingPrice, productId, type, total: qty * sellingPrice});
    renderCart();
    document.getElementById('posQty').value=1;
    document.getElementById('posCustomName').value='';
    document.getElementById('posPrice').value='';
    document.getElementById('posProductSelect').value='';
}
function renderCart() {
    const container = document.getElementById('cartItemsList');
    if(cart.length===0){container.innerHTML='<div class="cart-item">Cart is empty</div>';document.getElementById('cartTotal').innerHTML='Total: KES 0.00';return;}
    let html='',total=0;
    cart.forEach((item,idx)=>{ total+=item.total; html+=`<div class="cart-item"><span>${escapeHtml(item.name)}</span><span>${item.qty} x ${formatKES(item.sellingPrice)}</span><span>${formatKES(item.total)}</span><button class="remove-cart-item" data-idx="${idx}" style="background:#b91c1c; padding:0.2rem 0.6rem;">🗑️</button></div>`; });
    container.innerHTML=html;
    document.getElementById('cartTotal').innerHTML=`Total: ${formatKES(total)}`;
    document.querySelectorAll('.remove-cart-item').forEach(btn=>btn.addEventListener('click',()=>{const idx=parseInt(btn.dataset.idx);cart.splice(idx,1);renderCart();}));
}
document.getElementById('addToCartBtn').onclick=addToCart;
document.getElementById('clearCartBtn').onclick=()=>{cart=[];renderCart();};
async function completeSale() {
    if(cart.length===0){alert("Cart empty");return;}
    const clientNumber=document.getElementById('clientNumber').value.trim();
    if(!clientNumber){alert("Client number required");return;}
    const paymentMethod=document.getElementById('paymentMethod').value;
    const total=cart.reduce((s,i)=>s+i.total,0);
    const receiptNo=`NB-${Date.now()}`;
    const batch=writeBatch(db);
    for(const item of cart){
        if(item.type==="Product"){
            const stockItem = stockItems.find(s=>s.name.toLowerCase()===item.name.toLowerCase());
            if(stockItem){
                const newQty = stockItem.quantity - item.qty;
                if(newQty<0){alert(`Stock insufficient for ${item.name}`);return;}
                batch.update(doc(db,"stock",stockItem.id),{quantity:newQty});
            }
        }
    }
    const transactionRef = doc(collection(db,"transactions"));
    batch.set(transactionRef,{ receiptNo, clientNumber, paymentMethod, items: cart.map(i => ({ name: i.name, qty: i.qty, sellingPrice: i.sellingPrice, buyingPrice: i.buyingPrice, type: i.type, total: i.total })), total, date: new Date().toISOString(), userId: auth.currentUser?.uid });
    await batch.commit();
    printReceipt({receiptNo,clientNumber,paymentMethod,items:cart,total,date:new Date()});
    showToast("Sale completed & stock updated");
    cart=[]; renderCart(); document.getElementById('clientNumber').value='';
    setTimeout(()=>{onSnapshot(collection(db,"stock"),snap=>{stockItems=[];snap.forEach(d=>stockItems.push({id:d.id,...d.data()}));renderStock();refreshProductSelect();});},500);
    loadRecentTransactions();
    updateDashboard();
}
document.getElementById('completeSaleBtn').onclick=completeSale;
function printReceipt(sale) {
    const win=window.open('','_blank');
    let itemsHtml='';
    sale.items.forEach(item=>{itemsHtml+=`<tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${item.qty}</td>
            <td>${formatKES(item.sellingPrice)}</td>
            <td>${formatKES(item.total)}</td>
        </tr>`;});
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt ${sale.receiptNo}</title><style>@page{size:A6;margin:1.2rem;}body{font-family:'Inter',monospace;background:white;margin:0;padding:0;display:flex;justify-content:center;align-items:center;min-height:100vh;}.receipt{max-width:100%;background:white;border-radius:24px;box-shadow:0 12px 30px rgba(0,0,0,0.1);border:1px solid #e2e8f0;overflow:hidden;font-size:11px;}.receipt-header{background:#4169E1;color:white;padding:1rem;text-align:center;}.receipt-body{padding:1.2rem;}.info-row{display:flex;justify-content:space-between;border-bottom:1px dashed #e2e8f0;padding-bottom:0.4rem;margin-bottom:0.5rem;}.total-row{text-align:right;font-weight:bold;border-top:2px solid #4169E1;margin-top:0.8rem;padding-top:0.5rem;}.footer{text-align:center;font-size:0.6rem;margin-top:1rem;}</style></head><body><div class="receipt"><div class="receipt-header"><h2>📖 NABORE BOOKSHOP</h2><p>Your trusted bookstore</p></div><div class="receipt-body"><div class="info-row"><span><strong>Receipt #</strong> ${sale.receiptNo}</span><span><strong>Date</strong> ${new Date(sale.date).toLocaleString()}</span></div><div class="info-row"><span><strong>Client</strong> ${escapeHtml(sale.clientNumber)}</span><span><strong>Payment</strong> ${sale.paymentMethod}</span></div><table style="width:100%"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody></table><div class="total-row">TOTAL: ${formatKES(sale.total)}</div><div class="footer">Thank you for shopping with us</div></div></div></body></html>`);
    win.document.close();
    win.print();
}

// ========== TRANSACTIONS ==========
async function loadRecentTransactions() {
    const q = query(collection(db,"transactions"), orderBy("date","desc"));
    const snap = await getDocs(q);
    const tbody = document.getElementById('transactionsBody');
    if(snap.empty){ tbody.innerHTML = '<tr><td colspan="6">No transactions</td></tr>'; return; }
    let html='';
    snap.forEach(doc=>{ const t=doc.data(); html+=`<tr>
            <td>${new Date(t.date).toLocaleString()}</td>
            <td>${escapeHtml(t.clientNumber)}</td>
            <td>${t.paymentMethod}</td>
            <td>${t.items.length} items</td>
            <td>${formatKES(t.total)}</td>
            <td><button class="reprintBtn" data-receipt='${JSON.stringify(t)}'>🖨️ Reprint</button></td>
        </tr>`; });
    tbody.innerHTML = html;
    document.querySelectorAll('.reprintBtn').forEach(btn => btn.addEventListener('click',()=>{ const data=JSON.parse(btn.dataset.receipt); printReceipt({receiptNo:data.receiptNo,clientNumber:data.clientNumber,paymentMethod:data.paymentMethod,items:data.items.map(i=>({...i, sellingPrice: i.sellingPrice})),total:data.total,date:data.date}); }));
}
async function exportTransactionsToCSV() {
    try {
        const q = query(collection(db,"transactions"), orderBy("date","desc"));
        const snap = await getDocs(q);
        if(snap.empty){ showToast("No transactions to export"); return; }
        const headers = ["Receipt No","Date","Client Number","Payment Method","Items (Name x Qty)","Total (KES)"];
        const rows = [];
        snap.forEach(doc => { const t=doc.data(); const itemsSummary = t.items.map(i=>`${i.name} x${i.qty}`).join("; "); rows.push([t.receiptNo, new Date(t.date).toLocaleString(), t.clientNumber, t.paymentMethod, itemsSummary, t.total.toFixed(2)]); });
        const csvContent = [headers, ...rows].map(row=>row.join(",")).join("\n");
        const blob = new Blob([csvContent], {type:"text/csv"}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Nabore_Transactions_${new Date().toISOString().slice(0,19)}.csv`; a.click(); showToast("Transactions CSV exported");
    } catch(err) { showToast("Export failed: "+err.message); }
}

// ========== DASHBOARD ==========
async function updateDashboard() {
    const stockValue = stockItems.reduce((sum,i)=>sum+(i.quantity*i.price),0);
    document.getElementById('totalStockValue').innerText = formatKES(stockValue);
    let totalRevenue = 0, totalProfit = 0;
    transactions.forEach(t => { t.items.forEach(item => { const revenue = item.total; totalRevenue += revenue; let cost = 0; if(item.type === "Product") cost = (item.buyingPrice || 0) * item.qty; totalProfit += revenue - cost; }); });
    const totalExp = expenses.reduce((sum,e)=>sum+e.amount,0);
    const netProfit = totalProfit - totalExp;
    document.getElementById('totalSalesRevenue').innerText = formatKES(totalRevenue);
    document.getElementById('totalExpensesDashboard').innerText = formatKES(totalExp);
    document.getElementById('netProfitDashboard').innerText = formatKES(netProfit);
    const last7 = [...Array(7)].map((_,i)=>{let d=new Date();d.setDate(d.getDate()-i);return d.toISOString().slice(0,10);}).reverse();
    const salesByDay={}, expByDay={};
    transactions.forEach(t=>{const day=t.date.slice(0,10);salesByDay[day]=(salesByDay[day]||0)+t.total;});
    expenses.forEach(e=>{expByDay[e.date]=(expByDay[e.date]||0)+e.amount;});
    const salesData=last7.map(d=>salesByDay[d]||0);
    const expData=last7.map(d=>expByDay[d]||0);
    if(trendChart)trendChart.destroy();
    trendChart=new Chart(document.getElementById('trendChart'),{type:'line',data:{labels:last7,datasets:[{label:'Sales Revenue',data:salesData,borderColor:'#4169E1'},{label:'Expenses',data:expData,borderColor:'#e67e22'}]}});
    const stockNames=stockItems.map(s=>s.name);
    const stockValues=stockItems.map(s=>s.quantity*s.price);
    if(pieChart)pieChart.destroy();
    pieChart=new Chart(document.getElementById('stockPieChart'),{type:'pie',data:{labels:stockNames,datasets:[{data:stockValues,backgroundColor:'#4169E1'}]}});
}

function updateManagementFeatures() {
    const productSales = {};
    transactions.forEach(t => { t.items.forEach(item => { if(item.type === "Product") { const name = item.name; if(!productSales[name]) productSales[name] = 0; productSales[name] += item.qty; } }); });
    const sorted = Object.entries(productSales).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topDiv = document.getElementById('topSellingList');
    if(sorted.length === 0) topDiv.innerHTML = '<p>No product sales yet.</p>';
    else { let html = '<ul>'; sorted.forEach(([name, qty]) => html += `<li>${escapeHtml(name)}: ${qty} sold</li>`); html += '</ul>'; topDiv.innerHTML = html; }
    const lowStockItems = stockItems.filter(i => i.quantity <= i.lowThreshold);
    const reorderDiv = document.getElementById('reorderSuggestions');
    if(lowStockItems.length === 0) reorderDiv.innerHTML = '<p>All stock levels are healthy.</p>';
    else { let html = '<ul>'; lowStockItems.forEach(i => html += `<li>${escapeHtml(i.name)}: only ${i.quantity} left (reorder ${i.lowThreshold * 2} units)</li>`); html += '</ul>'; reorderDiv.innerHTML = html; }
}

// ========== SALES HISTORY ==========
function renderSalesHistory() { const tbody = document.getElementById('salesHistoryBody'); if(!salesHistory.length){ tbody.innerHTML='<tr><td colspan="6">No sales records found.</td></tr>'; resetSalesHistoryStats(); return; } let totalServices=0,totalProduct=0,totalExpenses=0; let html=''; salesHistory.forEach(record=>{ const s=record.services||0; const p=record.product||0; const e=record.expenses||0; const net=s+p-e; totalServices+=s; totalProduct+=p; totalExpenses+=e; const img=record.image?`<img src="${record.image}" style="width:40px;height:40px;border-radius:8px;" onclick="window.open('${record.image}','_blank')">`:'—'; html+=`<tr>
        <td>${record.date}</td>
        <td>${formatKES(s)}</td>
        <td>${formatKES(p)}</td>
        <td>${formatKES(e)}</td>
        <td>${formatKES(net)}</td>
        <td>${img}</td>
    </tr>`; }); tbody.innerHTML=html; document.getElementById('salesHistoryTotalServices').innerText=formatKES(totalServices); document.getElementById('salesHistoryTotalProduct').innerText=formatKES(totalProduct); document.getElementById('salesHistoryTotalExpenses').innerText=formatKES(totalExpenses); document.getElementById('salesHistoryNetProfit').innerText=formatKES(totalServices+totalProduct-totalExpenses); }
function resetSalesHistoryStats() { document.getElementById('salesHistoryTotalServices').innerText='KES 0.00'; document.getElementById('salesHistoryTotalProduct').innerText='KES 0.00'; document.getElementById('salesHistoryTotalExpenses').innerText='KES 0.00'; document.getElementById('salesHistoryNetProfit').innerText='KES 0.00'; }
function exportSalesHistoryToCSV() { if(!salesHistory.length){alert("No sales data to export.");return;} const headers=["Date","Services (KES)","Product Sales (KES)","Expenses (KES)","Net Profit (KES)","Has Image"]; const rows=salesHistory.map(rec=>{const s=rec.services||0,p=rec.product||0,e=rec.expenses||0; return [rec.date,s.toFixed(2),p.toFixed(2),e.toFixed(2),(s+p-e).toFixed(2),rec.image?"Yes":"No"];}); const csv=[headers,...rows].map(r=>r.join(",")).join("\n"); const blob=new Blob([csv],{type:"text/csv"}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`Nabore_Sales_History_${new Date().toISOString().slice(0,19)}.csv`; a.click(); showToast("CSV exported"); }

// ========== AI INSIGHTS ==========
function maybeLoadApiKey() { const input = document.getElementById('geminiApiKey'); if(input && geminiApiKey) input.value = geminiApiKey; }
document.getElementById('saveApiKeyBtn').onclick = () => { const key = document.getElementById('geminiApiKey').value.trim(); if(key) { localStorage.setItem('geminiApiKey', key); geminiApiKey = key; showToast("API key saved locally"); } else { showToast("Please enter a valid API key"); } };
document.getElementById('getAiInsightsBtn').onclick = async () => {
    const key = localStorage.getItem('geminiApiKey');
    if(!key) { showToast("Please save your Gemini API key first"); return; }
    if(!transactions.length && !stockItems.length && !expenses.length) { document.getElementById('aiResponse').innerHTML = "⚠️ Not enough data yet. Add some sales, stock, or expenses to get insights."; return; }
    document.getElementById('aiResponse').innerHTML = "🤔 AI is thinking... (usually takes 3-5 seconds)";
    const last7Trans = [...transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,7);
    const lowStock = stockItems.filter(i=>i.quantity <= i.lowThreshold).map(i=>`${i.name} (${i.quantity} left)`);
    const recentExpenses = [...expenses].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
    let totalProfit = 0;
    transactions.forEach(t => { t.items.forEach(item => { const revenue = item.total; const cost = (item.type === "Product" ? (item.buyingPrice||0) * item.qty : 0); totalProfit += revenue - cost; }); });
    const totalExp = expenses.reduce((s,e)=>s+e.amount,0);
    const netProfit = totalProfit - totalExp;
    const prompt = `You are a business analyst for Nabore Bookshop. Based on the following data, give a short, actionable business insight (max 150 words). Include: 1) sales trend, 2) stock alerts, 3) expense advice, 4) one prediction for next week.
Data:
- Last 7 transactions total revenue: KES ${last7Trans.reduce((s,t)=>s+t.total,0).toFixed(2)}
- Low stock items: ${lowStock.length ? lowStock.join(", ") : "none"}
- Recent expenses: ${recentExpenses.map(e=>`${e.category} ${e.amount}`).join(", ") || "none"}
- Net profit (after product costs and expenses): ${netProfit.toFixed(2)}
Write in a friendly, professional tone.`;
    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const text = await result.response.text();
        document.getElementById('aiResponse').innerHTML = `✨ <strong>AI Insights</strong><br>${text.replace(/\n/g,'<br>')}`;
    } catch(err) { console.error(err); document.getElementById('aiResponse').innerHTML = `❌ AI error: ${err.message}. Check your API key and internet connection.`; }
};

// ========== TAB SWITCHING ==========
const tabs = document.querySelectorAll('.tab-btn');
const panes = { pos: document.getElementById('posTab'), products: document.getElementById('productsTab'), stock: document.getElementById('stockTab'), expenses: document.getElementById('expensesTab'), dashboard: document.getElementById('dashboardTab'), saleshistory: document.getElementById('saleshistoryTab') };
tabs.forEach(btn => { btn.addEventListener('click', () => { tabs.forEach(b => b.classList.remove('active')); btn.classList.add('active'); Object.values(panes).forEach(p => p.classList.remove('active')); panes[btn.dataset.tab].classList.add('active'); if (btn.dataset.tab === 'dashboard') { updateDashboard(); maybeLoadApiKey(); updateManagementFeatures(); } if (btn.dataset.tab === 'pos') refreshProductSelect(); if (btn.dataset.tab === 'expenses') loadExpensesWithFilters(); if (btn.dataset.tab === 'saleshistory') renderSalesHistory(); }); });

// ========== INIT APP ==========
function initApp() {
    onSnapshot(collection(db,"products"), snap=>{products=[];snap.forEach(d=>products.push({id:d.id,...d.data()}));renderProducts();refreshProductSelect();});
    onSnapshot(collection(db,"stock"), snap=>{stockItems=[];snap.forEach(d=>stockItems.push({id:d.id,...d.data()}));renderStock();if(panes.dashboard.classList.contains('active')){updateDashboard();updateManagementFeatures();}});
    onSnapshot(collection(db,"expenses"), snap=>{expenses=[];snap.forEach(d=>expenses.push({id:d.id,...d.data()}));loadExpensesWithFilters();if(panes.dashboard.classList.contains('active'))updateDashboard();});
    onSnapshot(collection(db,"transactions"), snap=>{transactions=[];snap.forEach(d=>transactions.push({id:d.id,...d.data()}));loadRecentTransactions();if(panes.dashboard.classList.contains('active')){updateDashboard();updateManagementFeatures();}});
    onSnapshot(query(collection(db,"sales"), orderBy("date","asc")), snap=>{salesHistory=[];snap.forEach(doc=>{salesHistory.push({id:doc.id,...doc.data()});});renderSalesHistory();});
    document.getElementById('expenseDate').valueAsDate=new Date();
    refreshProductSelect();
    updateDashboard();
    updateManagementFeatures();
    document.getElementById('exportSalesHistoryCsv').onclick=exportSalesHistoryToCSV;
    document.getElementById('exportTransactionsCsv').onclick=exportTransactionsToCSV;
    maybeLoadApiKey();
}

// Optional service worker (no 404 if missing)
try {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => console.log('Service worker not available'));
    }
} catch(e) { console.log('SW not used'); }
