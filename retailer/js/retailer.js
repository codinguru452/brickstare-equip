(function () {
  'use strict';

  const KEYS = { user: 'brickstareRetailerUser' };
  const API = '/api';

  function readUser() {
    try { return JSON.parse(localStorage.getItem(KEYS.user) || 'null'); } catch (_) { return null; }
  }
  function setUser(user) { localStorage.setItem(KEYS.user, JSON.stringify(user)); }
  async function ensureRetailerSession() {
    try {
      const data = await api('/me');
      if (!data.user || data.user.role !== 'retailer') throw new Error('Retailer login required.');
      setUser(data.user);
      return data.user;
    } catch (_) {
      localStorage.removeItem(KEYS.user);
      window.location.href = '/auth/auth.html';
      return null;
    }
  }
  function money(value) { return `KSh ${Number(value || 0).toLocaleString()}`; }
  function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
  function formatDate(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleString([], { dateStyle:'medium', timeStyle:'short' }); }
  function statusClass(status) { return String(status || '').toLowerCase().replace(/\s+/g, '-'); }

  async function api(path, options = {}) {
    const opts = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const response = await fetch(`${API}${path}`, opts);
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
    return data;
  }

  function requireLogin() { return true; }

  function shell(page, content) {
    const user = readUser();
    const name = user?.name || user?.email?.split('@')[0] || 'Retailer';
    const nav = [
      ['dashboard.html','Dashboard','dashboard'],
      ['new-delivery.html','New Delivery','new-delivery'],
      ['my-deliveries.html','My Deliveries','my-deliveries'],
      ['inventory.html','Inventory','inventory'],
      ['notifications.html','Notifications','notifications']
    ];
    document.getElementById('app').innerHTML = `
      <div class="app">
        <aside class="sidebar">
          <div class="logo"><div class="logo-mark">B</div><div><h2>BrickStare</h2><span>Retailer Portal</span></div></div>
          <nav class="navigation">
            ${nav.map(([href,label,key]) => `<a class="nav-item ${page === key ? 'active' : ''}" href="${href}"><span aria-hidden="true">${icon(key)}</span><span>${label}</span></a>`).join('')}
          </nav>
          <div class="sidebar-bottom">
            <a class="nav-item ${page === 'settings' ? 'active' : ''}" href="settings.html"><span aria-hidden="true">⚙</span><span>Settings</span></a>
            <button class="nav-item logout-button" id="logoutBtn" type="button"><span aria-hidden="true">↪</span><span>Log Out</span></button>
          </div>
        </aside>
        <main class="main-content">
          <header class="top-header">
            <div><h1>${pageTitle(page)}</h1><p>${pageSubtitle(page)}</p></div>
            <div class="header-actions"><a class="notification-button" href="notifications.html" title="Notifications" aria-label="Notifications">${icon('bell')}</a><div class="profile"><div class="avatar">R</div><div><strong>${esc(name)}</strong><span>Retailer</span></div></div></div>
          </header>
          ${content}
        </main>
      </div>`;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      if (!confirm('Log out of BrickStare?')) return;
      try { await api('/logout', { method:'POST' }); } catch (_) {}
      localStorage.removeItem(KEYS.user);
      window.location.href = '/auth/auth.html';
    });
  }

  function icon(name) { return `<span class="icon-text">${({dashboard:'▦','new-delivery':'+','my-deliveries':'▣',inventory:'□',notifications:'●',bell:'♢'}[name] || '•')}</span>`; }
  function pageTitle(page) { return ({dashboard:'Dashboard','new-delivery':'New Delivery','my-deliveries':'My Deliveries',inventory:'Inventory',notifications:'Notifications',settings:'Settings','delivery-details':'Delivery Details'})[page] || 'BrickStare'; }
  function pageSubtitle(page) { return ({dashboard:'Orders and delivery requests','new-delivery':'Create a delivery request','my-deliveries':'Track your active and completed deliveries',inventory:'Manage products available for sale',notifications:'Updates about your deliveries',settings:'Manage your retailer preferences','delivery-details':'View delivery information and progress'})[page] || ''; }

  function initLogin() {
    window.location.replace('/auth/auth.html');
  }

  async function initDashboard() {
    if (!await ensureRetailerSession()) return;
    try {
      const [oData,dData] = await Promise.all([api('/orders'), api('/deliveries')]);
      const orders = (oData.orders || []).filter(o => o.status === 'New');
      const deliveries = dData.deliveries || [];
      const pending=deliveries.filter(d=>d.status==='Pending').length;
      const progress=deliveries.filter(d=>['Assigned','Picked Up'].includes(d.status)).length;
      const done=deliveries.filter(d=>d.status==='Delivered').length;
      shell('dashboard', `
        <section class="welcome-section"><div><h2>Good morning</h2><p>Review customer orders and keep deliveries moving.</p></div><a class="button button-primary" href="new-delivery.html">+ New Delivery</a></section>
        <section class="stats-grid">${stat('▣','Deliveries',deliveries.length)}${stat('◷','Pending',pending)}${stat('↗','In Progress',progress)}${stat('✓','Delivered',done)}</section>
        <section class="deliveries-section"><div class="section-header"><div><h2>Customer Orders</h2><p>Orders waiting to become delivery requests.</p></div></div><div class="delivery-table">${orders.length?orders.slice(0,6).map(orderRow).join(''):'<div class="empty">No new customer orders.</div>'}</div></section>
        <section class="deliveries-section"><div class="section-header"><div><h2>Recent Deliveries</h2><p>Track requests after they are created.</p></div><a class="view-all-button" href="my-deliveries.html">View all</a></div><div class="delivery-table">${deliveries.length?deliveries.slice(0,5).map(deliveryRow).join(''):'<div class="empty">No delivery requests yet.</div>'}</div></section>`);
    } catch (err) {
      shell('dashboard', `<section class="welcome-section"><div><h2>Unable to load dashboard</h2><p>${esc(err.message)}</p></div><button class="button button-primary" onclick="location.reload()">Try again</button></section>`);
    }
  }
  function stat(symbol,label,value){return `<div class="stat-card"><div class="stat-icon">${symbol}</div><div><span>${label}</span><h3>${value}</h3></div></div>`;}
  function orderRow(o){return `<div class="delivery-row"><span>${esc(o.id)}</span><span>${esc(o.customerName)}</span><span>${esc((o.items||[]).map(i=>`${i.productName} x${i.quantity}`).join(', '))}</span><span class="status pending">New</span><a class="details-button" href="new-delivery.html?order=${encodeURIComponent(o.id)}">Create Delivery</a></div>`;}
  function deliveryRow(d){return `<div class="delivery-row"><span>${esc(d.id)}</span><span>${esc(d.customerName)}</span><span>${esc(d.destination)}</span><span class="status ${statusClass(d.status)}">${esc(d.status)}</span><a class="details-button" href="delivery-details.html?id=${encodeURIComponent(d.id)}">View</a></div>`;}

  async function initNewDelivery() {
    if (!await ensureRetailerSession()) return;
    let orders=[];
    try { orders=(await api('/orders')).orders.filter(o=>o.status==='New'); } catch (_) {}
    shell('new-delivery', `<section class="form-section"><form id="deliveryForm"><div class="delivery-form">
      <div class="form-group full"><label for="orderId">Customer order <span class="helper">optional</span></label><select id="orderId"><option value="">Enter delivery details below</option>${orders.map(o=>`<option value="${esc(o.id)}">${esc(o.id)} · ${esc(o.customerName)}</option>`).join('')}</select></div>
      <div class="form-group"><label for="customerName">Customer name</label><input id="customerName" required></div>
      <div class="form-group"><label for="customerPhone">Customer phone</label><input id="customerPhone" placeholder="07XX XXX XXX" required></div>
      <div class="form-group full"><label for="destination">Delivery address</label><input id="destination" placeholder="e.g. Westlands, Nairobi" required></div>
      <div class="form-group full"><label for="itemDescription">Item description</label><textarea id="itemDescription" rows="3" placeholder="e.g. LED TV x1" required></textarea></div>
      <div class="form-group"><label for="deliveryDate">Delivery date</label><input id="deliveryDate" type="date" required></div>
      <div class="form-group"><label for="deliveryTime">Delivery time</label><input id="deliveryTime" type="time" required></div>
      <div class="form-group full"><label for="notes">Notes <span class="helper">optional</span></label><textarea id="notes" rows="3" placeholder="Gate number, preferred contact time, or other useful detail"></textarea></div>
    </div><div id="deliveryError" class="form-error hidden"></div><div class="form-actions"><a class="button button-secondary" href="dashboard.html">Cancel</a><button class="button button-primary" type="submit">Create Delivery</button></div></form></section>`);
    const selected=new URLSearchParams(location.search).get('order'), select=document.getElementById('orderId');
    const fill=id=>{const o=orders.find(x=>x.id===id);if(!o)return;document.getElementById('customerName').value=o.customerName;document.getElementById('customerPhone').value=o.phone||'';document.getElementById('destination').value=o.address||'';document.getElementById('itemDescription').value=(o.items||[]).map(i=>`${i.productName} x${i.quantity}`).join(', ');};
    select.addEventListener('change',e=>fill(e.target.value)); if(selected){select.value=selected;fill(selected);}
    document.getElementById('deliveryForm').addEventListener('submit',async e=>{
      e.preventDefault(); const error=document.getElementById('deliveryError');error.classList.add('hidden');
      const payload={orderId:select.value||null,customerName:document.getElementById('customerName').value.trim(),customerPhone:document.getElementById('customerPhone').value.trim(),destination:document.getElementById('destination').value.trim(),itemDescription:document.getElementById('itemDescription').value.trim(),deliveryDate:document.getElementById('deliveryDate').value,deliveryTime:document.getElementById('deliveryTime').value,notes:document.getElementById('notes').value.trim()};
      try { const data=await api('/deliveries',{method:'POST',body:payload}); window.location.href=`delivery-details.html?id=${encodeURIComponent(data.delivery.id)}`; }
      catch(err){error.textContent=err.message;error.classList.remove('hidden');}
    });
  }

  async function initMyDeliveries(){
    if(!await ensureRetailerSession())return;
    try { const ds=(await api('/deliveries')).deliveries||[]; shell('my-deliveries',`<section class="deliveries-section"><div class="section-header"><div><h2>My Deliveries</h2><p>Updates are reflected here as the delivery moves through the process.</p></div><a class="button button-primary" href="new-delivery.html">+ New Delivery</a></div><div class="delivery-table">${ds.length?ds.map(deliveryRow).join(''):'<div class="empty">You have not created any deliveries yet.</div>'}</div></section>`); }
    catch(err){shell('my-deliveries',`<section class="welcome-section"><div><h2>Unable to load deliveries</h2><p>${esc(err.message)}</p></div></section>`);}
  }

  async function initDetails(){
    if(!await ensureRetailerSession())return; const id=new URLSearchParams(location.search).get('id');
    try {
      const d=(await api(`/deliveries/${encodeURIComponent(id)}`)).delivery;
      shell('delivery-details',`<section class="welcome-section"><div><h2>${esc(d.id)}</h2><p>${esc(d.itemDescription)}</p></div><span class="status ${statusClass(d.status)}">${esc(d.status)}</span></section>
      <section class="deliveries-section"><div class="section-header"><div><h2>Customer details</h2><p>Information attached to this delivery request.</p></div></div><div class="detail-grid">${detail('Customer',d.customerName)}${detail('Phone',d.customerPhone)}${detail('Address',d.destination)}${detail('Delivery date',d.deliveryDate)}${detail('Delivery time',d.deliveryTime)}${detail('Assigned rider',d.riderName||d.riderId||'Waiting for dispatcher')}${detail('Notes',d.notes||'No notes')}</div></section>
      <section class="deliveries-section"><div class="section-header"><div><h2>Delivery progress</h2><p>Status changes made by the delivery team appear here.</p></div></div><div class="timeline">${(d.statusHistory||[]).map(x=>`<div class="timeline-item"><strong>${esc(x.status)}</strong><span>${formatDate(x.timestamp)}</span></div>`).join('')}</div></section><a class="button button-secondary" href="my-deliveries.html">← Back to My Deliveries</a>`);
    } catch(err){shell('delivery-details',`<section class="welcome-section"><div><h2>Delivery not found</h2><p>${esc(err.message)}</p></div><a class="button button-primary" href="my-deliveries.html">Back to deliveries</a></section>`);}
  }
  function detail(label,value){return `<div class="detail-item"><label>${esc(label)}</label><p>${esc(value)}</p></div>`;}

  async function initInventory(){
    if(!await ensureRetailerSession())return;
    try { await renderInventory(); } catch(err){shell('inventory',`<section class="welcome-section"><div><h2>Unable to load inventory</h2><p>${esc(err.message)}</p></div></section>`);}
  }
  async function renderInventory(){
    const products=(await api('/inventory')).products||[];
    shell('inventory',`<section class="deliveries-section"><div class="inventory-toolbar"><div><h2>Products</h2><p>Add new stock and keep the retailer catalogue up to date.</p></div><button class="button button-primary" id="addProductBtn">+ Add Product</button></div><div class="product-grid">${products.map(productCard).join('')||'<div class="empty">No products in inventory.</div>'}</div></section>`);
    document.getElementById('addProductBtn').addEventListener('click',openProductModal);
  }
  function productCard(p){return `<article class="product-card"><div class="product-image">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:'No image'}</div><div class="product-body"><h3>${esc(p.name)}</h3><p>${esc(p.category||'')}</p><div class="product-meta"><span class="price">${money(p.price)}</span><span class="stock">${Number(p.stock)} in stock</span></div></div></article>`;}
  function openProductModal(){
    const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.id='productModal';wrap.innerHTML=`<div class="modal"><h2>Add product</h2><p>Enter the details for new stock and attach a product photo.</p><form id="productForm"><div class="form-group"><label>Product name<input id="pName" required placeholder="e.g. Power Drill"></label></div><div class="form-group" style="margin-top:15px"><label>Category<select id="pCategory"><option>Electronics</option><option>Pharmacy</option><option>Hardware</option></select></label></div><div class="form-group" style="margin-top:15px"><label>Price (KSh)<input id="pPrice" type="number" min="0" required></label></div><div class="form-group" style="margin-top:15px"><label>Stock quantity<input id="pStock" type="number" min="0" required></label></div><div class="form-group" style="margin-top:15px"><label>Product image<input id="pImage" type="file" accept="image/*"><span class="helper">Choose one photo of this product.</span></label><div class="image-preview" id="imagePreview">No image selected</div></div><div id="productError" class="form-error hidden" style="margin-top:15px"></div><div class="modal-actions"><button type="button" class="button button-secondary" id="cancelProduct">Cancel</button><button type="submit" class="button button-primary">Add Product</button></div></form></div>`;
    document.body.appendChild(wrap);const input=wrap.querySelector('#pImage'),preview=wrap.querySelector('#imagePreview');
    input.addEventListener('change',()=>{const f=input.files[0];if(!f){preview.textContent='No image selected';return;}const r=new FileReader();r.onload=()=>preview.innerHTML=`<img src="${r.result}" alt="Preview">`;r.readAsDataURL(f);});
    wrap.querySelector('#cancelProduct').onclick=()=>wrap.remove();wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove();});
    wrap.querySelector('#productForm').addEventListener('submit',async e=>{e.preventDefault();const f=input.files[0], error=wrap.querySelector('#productError');error.classList.add('hidden');let image='';try{if(f)image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});await api('/inventory',{method:'POST',body:{name:wrap.querySelector('#pName').value.trim(),category:wrap.querySelector('#pCategory').value,price:Number(wrap.querySelector('#pPrice').value),stock:Number(wrap.querySelector('#pStock').value),image}});wrap.remove();await renderInventory();}catch(err){error.textContent=err.message;error.classList.remove('hidden');}});
  }

  async function initNotifications(){
    if(!await ensureRetailerSession())return;
    try {const ns=(await api('/notifications')).notifications||[];shell('notifications',`<section class="deliveries-section"><div class="section-header"><div><h2>Notifications</h2><p>Important updates for your delivery requests.</p></div></div><div class="notice-list">${ns.length?ns.map(n=>`<article class="notice"><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${formatDate(n.time)}</small></article>`).join(''):'<div class="empty">No notifications.</div>'}</div></section>`);}
    catch(err){shell('notifications',`<section class="welcome-section"><div><h2>Unable to load notifications</h2><p>${esc(err.message)}</p></div></section>`);}
  }

  async function initSettings(){
    if(!await ensureRetailerSession())return;
    try {
      const s=(await api('/settings')).settings;
      shell('settings',`<div class="settings-layout"><nav class="settings-nav"><button class="active" data-tab="store">Store details</button><button data-tab="notifications">Notifications</button><button data-tab="account">Account</button></nav><section class="settings-panel"><div id="settingsPanel"></div></section></div>`);
      const panel=document.getElementById('settingsPanel');
      function render(tab){
        if(tab==='store')panel.innerHTML=`<h2>Store details</h2><p>Keep the information used on your retailer profile up to date.</p><form class="settings-form" id="storeForm"><div class="form-group"><label>Store name<input id="storeName" value="${esc(s.storeName)}"></label></div><div class="form-group"><label>Phone number<input id="storePhone" value="${esc(s.phone)}" placeholder="07XX XXX XXX"></label></div><div class="form-group full"><label>Email address<input value="${esc(s.email)}" disabled></label></div><div class="save-row full"><button class="button button-primary" type="submit">Save changes</button></div></form>`;
        if(tab==='notifications')panel.innerHTML=`<h2>Notifications</h2><p>Choose which retailer updates you want to receive.</p><div class="settings-option"><div><strong>Delivery updates</strong><span>Show updates when a delivery is assigned, picked up or delivered.</span></div><label class="switch"><input id="notifySwitch" type="checkbox" ${s.notifications?'checked':''}><span class="slider"></span></label></div><div class="save-row"><button class="button button-primary" id="saveNotify">Save changes</button></div>`;
        if(tab==='account')panel.innerHTML=`<h2>Account</h2><p>Your retailer account is managed by BrickStare.</p><div class="settings-option"><div><strong>Signed in as</strong><span>${esc(s.email)}</span></div><span class="status assigned">Retailer</span></div><div class="save-row"><button class="button button-danger" id="settingsLogout">Log out</button></div>`;
        const sf=document.getElementById('storeForm');if(sf)sf.onsubmit=async e=>{e.preventDefault();try{const data=await api('/settings',{method:'PATCH',body:{storeName:document.getElementById('storeName').value.trim()||'BrickStare Store',phone:document.getElementById('storePhone').value.trim(),notifications:s.notifications}});Object.assign(s,data.settings);showSaved(panel);}catch(err){showSaved(panel,err.message,true);}};
        const sn=document.getElementById('saveNotify');if(sn)sn.onclick=async()=>{try{const data=await api('/settings',{method:'PATCH',body:{storeName:s.storeName,phone:s.phone,notifications:document.getElementById('notifySwitch').checked}});Object.assign(s,data.settings);showSaved(panel);}catch(err){showSaved(panel,err.message,true);}};
        const lo=document.getElementById('settingsLogout');if(lo)lo.onclick=async()=>{try{await api('/logout',{method:'POST'});}catch(_){}localStorage.removeItem(KEYS.user);window.location.href='/auth/auth.html';};
      }
      function showSaved(p,msg='Changes saved.',bad=false){const n=document.createElement('div');n.className='success-note';n.textContent=msg;p.prepend(n);setTimeout(()=>n.remove(),2500);}
      document.querySelectorAll('.settings-nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.settings-nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');render(b.dataset.tab);});render('store');
    } catch(err){shell('settings',`<section class="welcome-section"><div><h2>Unable to load settings</h2><p>${esc(err.message)}</p></div></section>`);}
  }

  function init(){
    const page=document.body.dataset.page;
    if(page==='login'){initLogin();return;}
    const f={dashboard:initDashboard,'new-delivery':initNewDelivery,'my-deliveries':initMyDeliveries,'delivery-details':initDetails,inventory:initInventory,notifications:initNotifications,settings:initSettings}[page];
    if(f)f();
  }
  document.addEventListener('DOMContentLoaded',init);
})();