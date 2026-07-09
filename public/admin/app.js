// ============ 全局状态 ============
let allCategories = [];
let allDishes = [];
let allOrders = [];
let settings = {};
let currentOrderFilter = '';
let editingDishImageFile = null;
let editingDishImageUrl = '';
let isLoggedIn = false;

// ============ Token 管理 ============
function getToken() {
  return localStorage.getItem('admin_token') || '';
}

function setToken(token) {
  localStorage.setItem('admin_token', token);
}

function removeToken() {
  localStorage.removeItem('admin_token');
}

// ============ API（自动携带 Token，自动处理 401）============
async function api(url, options = {}) {
  const token = getToken();
  if (token) {
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      options.headers.set('Authorization', 'Bearer ' + token);
    } else {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
  }
  const res = await fetch(url, options);
  const data = await res.json();
  if (res.status === 401) {
    // 登录失效，跳回登录页
    removeToken();
    showLoginView();
    throw new Error(data.error || '登录已过期，请重新登录');
  }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ============ 视图切换 ============
async function showLoginView() {
  isLoggedIn = false;
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('adminLayout').style.display = 'none';
  // 清空登录表单
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginUsername').focus();
  // 加载自定义后台标题（公开接口，无需登录）
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    document.getElementById('loginTitle').textContent = s.adminTitle || '后台管理系统';
    document.title = s.adminTitle || '后台管理系统';
  } catch (e) { /* 忽略加载失败，使用默认标题 */ }
}

function showAdminView(username) {
  isLoggedIn = true;
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('adminLayout').style.display = 'flex';
  if (username) {
    document.getElementById('adminUsername').textContent = username;
  }
  // 更新浏览器标签页标题
  const title = settings.adminTitle || '后台管理系统';
  document.title = title;
}

// ============ 登录 ============
async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  const btnText = btn.querySelector('.login-btn-text');
  const btnSpinner = btn.querySelector('.login-btn-spinner');

  if (!username || !password) {
    errorEl.textContent = '请输入用户名和密码';
    return;
  }

  // 显示加载状态
  errorEl.textContent = '';
  btn.disabled = true;
  btnText.textContent = '登录中...';
  btnSpinner.style.display = 'inline-block';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      setToken(data.token);
      showAdminView(data.username);
      loadDashboard();
    } else {
      errorEl.textContent = data.error || '登录失败';
      btn.disabled = false;
      btnText.textContent = '登 录';
      btnSpinner.style.display = 'none';
    }
  } catch (e) {
    errorEl.textContent = '网络错误，请重试';
    btn.disabled = false;
    btnText.textContent = '登 录';
    btnSpinner.style.display = 'none';
  }
}

// ============ 登出 ============
async function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
  } catch (e) { /* 忽略 */ }
  removeToken();
  showLoginView();
}

// ============ 修改密码 ============
async function changePassword() {
  const currentPwd = document.getElementById('currentPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;

  if (!currentPwd) { showToast('请输入当前密码', 'error'); return; }
  if (!newPwd || newPwd.length < 4) { showToast('新密码至少4位', 'error'); return; }
  if (newPwd !== confirmPwd) { showToast('两次密码输入不一致', 'error'); return; }

  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
    });
    showToast('密码已修改，请重新登录');
    // 修改密码后需要重新登录
    setTimeout(() => {
      removeToken();
      showLoginView();
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
    }, 1500);
  } catch (e) {
    showToast('修改失败: ' + e.message, 'error');
  }
}

// ============ 页面切换 ============
function switchPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageName).classList.add('active');
  document.querySelector(`.nav-item[data-page="${pageName}"]`).classList.add('active');

  if (pageName === 'dashboard') loadDashboard();
  if (pageName === 'dishes') loadDishes();
  if (pageName === 'categories') loadCategories();
  if (pageName === 'orders') loadOrders();
  if (pageName === 'settings') loadSettings();
}

// ============ Toast ============
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ============ 仪表盘 ============
async function loadDashboard() {
  try {
    const [cats, dishes, orders, settingsData] = await Promise.all([
      api('/api/categories'),
      api('/api/dishes'),
      api('/api/orders'),
      api('/api/settings')
    ]);
    allCategories = cats;
    allDishes = dishes;
    allOrders = orders;
    settings = settingsData;

    document.getElementById('sidebarAppName').textContent = settings.appName || '菜单管理';

    document.getElementById('statDishes').textContent = dishes.length;
    document.getElementById('statCategories').textContent = cats.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter(o => o.createdAt >= today.getTime() && o.status !== 'cancelled');
    const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0);

    document.getElementById('statOrders').textContent = orders.length;
    document.getElementById('statRevenue').textContent = '¥' + todayRevenue.toFixed(2);

    // 最新订单
    const recent = orders.slice(0, 5);
    const recentEl = document.getElementById('recentOrders');
    if (recent.length === 0) {
      recentEl.innerHTML = '<div class="empty-row">暂无订单</div>';
    } else {
      recentEl.innerHTML = recent.map(o => `
        <div class="recent-order-item">
          <div class="recent-order-info">
            <div class="recent-order-no">${o.orderNo}</div>
            <div class="recent-order-items">${o.items.map(i => i.name + '×' + i.quantity).join('、')}</div>
          </div>
          <div class="recent-order-price">¥${o.total.toFixed(2)}</div>
        </div>
      `).join('');
    }
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('加载失败: ' + e.message, 'error');
    }
  }
}

// ============ 菜品管理 ============
async function loadDishes() {
  try {
    const [cats, dishes] = await Promise.all([
      api('/api/categories'),
      api('/api/dishes')
    ]);
    allCategories = cats;
    allDishes = dishes;

    // 填充分类筛选
    const filterSelect = document.getElementById('dishFilterCategory');
    filterSelect.innerHTML = '<option value="">全部分类</option>' +
      cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    renderDishTable();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('加载失败: ' + e.message, 'error');
    }
  }
}

function renderDishTable() {
  const tbody = document.getElementById('dishTableBody');
  const filterCat = document.getElementById('dishFilterCategory').value;
  const searchText = document.getElementById('dishSearchInput').value.toLowerCase();

  let filtered = allDishes;
  if (filterCat) filtered = filtered.filter(d => d.categoryId === filterCat);
  if (searchText) filtered = filtered.filter(d => d.name.toLowerCase().includes(searchText));

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">暂无菜品数据</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(dish => {
    const cat = allCategories.find(c => c.id === dish.categoryId);
    return `
      <tr>
        <td>
          ${dish.image
            ? `<img class="dish-thumb" src="${dish.image}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="dish-thumb-placeholder" style="display:none;"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`
            : `<div class="dish-thumb-placeholder"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`
          }
        </td>
        <td><strong>${escapeHtml(dish.name)}</strong></td>
        <td>${cat ? escapeHtml(cat.name) : '<span style="color:#999">未分类</span>'}</td>
        <td><span class="dish-price-cell">¥${dish.price.toFixed(2)}</span></td>
        <td style="color:#999;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(dish.description || '—')}</td>
        <td>
          <span class="badge ${dish.available ? 'badge-success' : 'badge-gray'}">
            ${dish.available ? '上架' : '下架'}
          </span>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-sm btn-outline" onclick="editDish('${dish.id}')">编辑</button>
            <button class="btn-sm btn-danger" onclick="deleteDish('${dish.id}')">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openDishModal() {
  document.getElementById('dishModalTitle').textContent = '添加菜品';
  document.getElementById('dishEditId').value = '';
  document.getElementById('dishName').value = '';
  document.getElementById('dishPrice').value = '';
  document.getElementById('dishDescription').value = '';
  document.getElementById('dishAvailable').checked = true;
  document.getElementById('dishAvailableLabel').textContent = '上架中';
  editingDishImageFile = null;
  editingDishImageUrl = '';

  // 填充分类
  const catSelect = document.getElementById('dishCategory');
  catSelect.innerHTML = allCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  // 重置图片
  document.getElementById('dishImagePreview').style.display = 'none';
  document.getElementById('imageUploadPlaceholder').style.display = 'flex';

  document.getElementById('dishModalOverlay').style.display = 'flex';
}

async function editDish(dishId) {
  const dish = allDishes.find(d => d.id === dishId);
  if (!dish) return;

  document.getElementById('dishModalTitle').textContent = '编辑菜品';
  document.getElementById('dishEditId').value = dish.id;
  document.getElementById('dishName').value = dish.name;
  document.getElementById('dishPrice').value = dish.price;
  document.getElementById('dishDescription').value = dish.description || '';
  document.getElementById('dishAvailable').checked = dish.available;
  document.getElementById('dishAvailableLabel').textContent = dish.available ? '上架中' : '已下架';

  // 填充分类
  const catSelect = document.getElementById('dishCategory');
  catSelect.innerHTML = allCategories.map(c =>
    `<option value="${c.id}" ${c.id === dish.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');

  // 显示图片
  editingDishImageFile = null;
  editingDishImageUrl = dish.image || '';
  if (dish.image) {
    const preview = document.getElementById('dishImagePreview');
    preview.src = dish.image;
    preview.style.display = 'block';
    document.getElementById('imageUploadPlaceholder').style.display = 'none';
  } else {
    document.getElementById('dishImagePreview').style.display = 'none';
    document.getElementById('imageUploadPlaceholder').style.display = 'flex';
  }

  document.getElementById('dishModalOverlay').style.display = 'flex';
}

function closeDishModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('dishModalOverlay').style.display = 'none';
}

function previewDishImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小不能超过5MB', 'error');
    input.value = '';
    return;
  }
  editingDishImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('dishImagePreview');
    preview.src = e.target.result;
    preview.style.display = 'block';
    document.getElementById('imageUploadPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function saveDish() {
  const id = document.getElementById('dishEditId').value;
  const name = document.getElementById('dishName').value.trim();
  const price = document.getElementById('dishPrice').value;
  const categoryId = document.getElementById('dishCategory').value;
  const description = document.getElementById('dishDescription').value.trim();
  const available = document.getElementById('dishAvailable').checked;

  if (!name) { showToast('请输入菜品名称', 'error'); return; }
  if (!price || isNaN(price)) { showToast('请输入有效价格', 'error'); return; }

  try {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('price', price);
    formData.append('categoryId', categoryId);
    formData.append('description', description);
    formData.append('available', available);
    if (editingDishImageFile) {
      formData.append('image', editingDishImageFile);
    }

    if (id) {
      await api('/api/dishes/' + id, { method: 'PUT', body: formData });
      showToast('菜品已更新');
    } else {
      await api('/api/dishes', { method: 'POST', body: formData });
      showToast('菜品已添加');
    }

    closeDishModal();
    await loadDishes();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }
}

async function deleteDish(dishId) {
  if (!confirm('确定要删除这个菜品吗？')) return;
  try {
    await api('/api/dishes/' + dishId, { method: 'DELETE' });
    showToast('菜品已删除');
    await loadDishes();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('删除失败: ' + e.message, 'error');
    }
  }
}

// ============ 分类管理 ============
async function loadCategories() {
  try {
    const [cats, dishes] = await Promise.all([
      api('/api/categories'),
      api('/api/dishes')
    ]);
    allCategories = cats;
    allDishes = dishes;
    renderCategoryTable();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('加载失败: ' + e.message, 'error');
    }
  }
}

function renderCategoryTable() {
  const tbody = document.getElementById('categoryTableBody');
  if (allCategories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">暂无分类，点击右上角添加</td></tr>';
    return;
  }
  tbody.innerHTML = allCategories.map((cat, i) => {
    const count = allDishes.filter(d => d.categoryId === cat.id).length;
    return `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(cat.name)}</strong></td>
        <td><span class="badge badge-info">${count} 个菜品</span></td>
        <td>
          <div class="table-actions">
            <button class="btn-sm btn-outline" onclick="editCategory('${cat.id}')">编辑</button>
            <button class="btn-sm btn-danger" onclick="deleteCategory('${cat.id}')">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openCategoryModal() {
  document.getElementById('categoryModalTitle').textContent = '添加分类';
  document.getElementById('categoryEditId').value = '';
  document.getElementById('categoryName').value = '';
  document.getElementById('categoryModalOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('categoryName').focus(), 100);
}

function editCategory(catId) {
  const cat = allCategories.find(c => c.id === catId);
  if (!cat) return;
  document.getElementById('categoryModalTitle').textContent = '编辑分类';
  document.getElementById('categoryEditId').value = cat.id;
  document.getElementById('categoryName').value = cat.name;
  document.getElementById('categoryModalOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('categoryName').focus(), 100);
}

function closeCategoryModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('categoryModalOverlay').style.display = 'none';
}

async function saveCategory() {
  const id = document.getElementById('categoryEditId').value;
  const name = document.getElementById('categoryName').value.trim();
  if (!name) { showToast('请输入分类名称', 'error'); return; }

  try {
    if (id) {
      await api('/api/categories/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      showToast('分类已更新');
    } else {
      await api('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      showToast('分类已添加');
    }
    closeCategoryModal();
    await loadCategories();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }
}

async function deleteCategory(catId) {
  if (!confirm('确定要删除这个分类吗？')) return;
  try {
    await api('/api/categories/' + catId, { method: 'DELETE' });
    showToast('分类已删除');
    await loadCategories();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('删除失败: ' + e.message, 'error');
    }
  }
}

// ============ 订单管理 ============
async function loadOrders() {
  try {
    const orders = await api('/api/orders');
    allOrders = orders;
    renderOrders();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('加载失败: ' + e.message, 'error');
    }
  }
}

function filterOrders(status) {
  currentOrderFilter = status;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.filter-tab[data-status="${status}"]`).classList.add('active');
  renderOrders();
}

function renderOrders() {
  const container = document.getElementById('ordersList');
  let orders = allOrders;
  if (currentOrderFilter) {
    orders = orders.filter(o => o.status === currentOrderFilter);
  }

  if (orders.length === 0) {
    container.innerHTML = '<div class="empty-row" style="padding:60px;text-align:center;color:#999">暂无订单</div>';
    return;
  }

  const statusMap = {
    pending: { label: '待确认', class: 'badge-warning' },
    confirmed: { label: '制作中', class: 'badge-info' },
    completed: { label: '已完成', class: 'badge-success' },
    cancelled: { label: '已取消', class: 'badge-gray' }
  };

  container.innerHTML = orders.map(o => {
    const st = statusMap[o.status] || statusMap.pending;
    const time = new Date(o.createdAt).toLocaleString('zh-CN');
    return `
      <div class="order-card">
        <div class="order-card-header">
          <div>
            <span class="order-no">${o.orderNo}</span>
            ${o.tableNumber ? `<span class="order-table-info">${escapeHtml(o.tableNumber)}</span>` : ''}
            <span class="badge ${st.class}" style="margin-left:8px">${st.label}</span>
          </div>
          <span class="order-time">${time}</span>
        </div>
        <div class="order-card-body">
          <div class="order-dishes-list">
            ${o.items.map(item => `
              <div class="order-dish-row">
                <span>${escapeHtml(item.name)} <span class="qty">×${item.quantity}</span></span>
                <span>¥${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            `).join('')}
            ${(o.tableFee > 0 || o.serviceFee > 0) ? `
              <div class="order-dish-row" style="color:#999;font-size:13px">
                <span>餐位费 + 服务费</span>
                <span>¥${(o.tableFee + o.serviceFee).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>
          ${o.remark ? `<div class="order-remark">备注：${escapeHtml(o.remark)}</div>` : ''}
        </div>
        <div class="order-card-footer">
          <div class="order-total">¥${o.total.toFixed(2)}</div>
          <div class="order-actions">
            ${o.status === 'pending' ? `
              <button class="btn-sm btn-success" onclick="updateOrderStatus('${o.id}', 'confirmed')">确认接单</button>
              <button class="btn-sm btn-danger" onclick="updateOrderStatus('${o.id}', 'cancelled')">取消订单</button>
            ` : ''}
            ${o.status === 'confirmed' ? `
              <button class="btn-sm btn-primary" onclick="updateOrderStatus('${o.id}', 'completed')">完成出餐</button>
              <button class="btn-sm btn-danger" onclick="updateOrderStatus('${o.id}', 'cancelled')">取消订单</button>
            ` : ''}
            ${o.status === 'completed' || o.status === 'cancelled' ? `
              <button class="btn-sm btn-outline" onclick="deleteOrder('${o.id}')">删除记录</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, status) {
  try {
    await api('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    showToast('订单状态已更新');
    await loadOrders();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('操作失败: ' + e.message, 'error');
    }
  }
}

async function deleteOrder(orderId) {
  if (!confirm('确定要删除这个订单记录吗？')) return;
  try {
    await api('/api/orders/' + orderId, { method: 'DELETE' });
    showToast('订单已删除');
    await loadOrders();
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('删除失败: ' + e.message, 'error');
    }
  }
}

// ============ 设置 ============
async function loadSettings() {
  try {
    settings = await api('/api/settings');
    document.getElementById('settingAppName').value = settings.appName || '';
    document.getElementById('settingSlogan').value = settings.slogan || '';
    document.getElementById('settingAdminTitle').value = settings.adminTitle || '';
    document.getElementById('settingPrimaryColor').value = settings.primaryColor || '#ff6b35';
    document.getElementById('settingPrimaryColorText').value = settings.primaryColor || '#ff6b35';
    document.getElementById('settingSecondaryColor').value = settings.secondaryColor || '#fff5f0';
    document.getElementById('settingSecondaryColorText').value = settings.secondaryColor || '#fff5f0';
    document.getElementById('settingTableFee').value = settings.tableFee || 0;
    document.getElementById('settingServiceFee').value = settings.serviceFee || 0;
    updateColorPreview();
    // 更新侧边栏和浏览器标题
    const title = settings.adminTitle || '后台管理系统';
    document.getElementById('sidebarAppName').textContent = title;
    document.title = title;
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('加载设置失败: ' + e.message, 'error');
    }
  }
}

function updateColorPreview() {
  const primary = document.getElementById('settingPrimaryColor').value;
  const secondary = document.getElementById('settingSecondaryColor').value;
  const appName = document.getElementById('settingAppName').value || '我的餐厅';
  const slogan = document.getElementById('settingSlogan').value || '新鲜美味，用心制作';

  document.getElementById('settingPrimaryColorText').value = primary;
  document.getElementById('settingSecondaryColorText').value = secondary;

  document.getElementById('previewHeader').style.background = `linear-gradient(135deg, ${primary}, ${primary}dd)`;
  document.getElementById('previewTitle').textContent = appName;
  document.getElementById('previewSlogan').textContent = slogan;
  document.getElementById('previewBtn').style.background = primary;
  document.getElementById('previewPrice').style.color = primary;
  document.querySelector('.preview-elements').style.background = secondary;
}

function syncColorFromText(type) {
  if (type === 'primary') {
    const val = document.getElementById('settingPrimaryColorText').value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      document.getElementById('settingPrimaryColor').value = val;
      updateColorPreview();
    }
  } else {
    const val = document.getElementById('settingSecondaryColorText').value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      document.getElementById('settingSecondaryColor').value = val;
      updateColorPreview();
    }
  }
}

function applyPreset(primary, secondary) {
  document.getElementById('settingPrimaryColor').value = primary;
  document.getElementById('settingSecondaryColor').value = secondary;
  updateColorPreview();
}

async function saveSettings() {
  const data = {
    appName: document.getElementById('settingAppName').value.trim() || '我的餐厅',
    slogan: document.getElementById('settingSlogan').value.trim(),
    adminTitle: document.getElementById('settingAdminTitle').value.trim(),
    primaryColor: document.getElementById('settingPrimaryColor').value,
    secondaryColor: document.getElementById('settingSecondaryColor').value,
    tableFee: parseFloat(document.getElementById('settingTableFee').value) || 0,
    serviceFee: parseFloat(document.getElementById('settingServiceFee').value) || 0
  };

  try {
    await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    settings = data;
    document.getElementById('sidebarAppName').textContent = data.appName;
    showToast('设置已保存');
  } catch (e) {
    if (!e.message.includes('登录已过期')) {
      showToast('保存失败: ' + e.message, 'error');
    }
  }
}

// ============ 开关联动 ============
document.addEventListener('change', (e) => {
  if (e.target.id === 'dishAvailable') {
    document.getElementById('dishAvailableLabel').textContent = e.target.checked ? '上架中' : '已下架';
  }
});

// ============ 工具函数 ============
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============ 初始化：验证登录状态 ============
async function init() {
  const token = getToken();
  if (!token) {
    showLoginView();
    return;
  }

  // 验证 Token 是否有效
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      const data = await res.json();
      showAdminView(data.username);
      loadDashboard();
    } else {
      removeToken();
      showLoginView();
    }
  } catch (e) {
    removeToken();
    showLoginView();
  }
}

// 启动
init();
