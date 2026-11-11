// Main Frontend Application Logic
let selectedPlanId = 1;
let selectedStrategyId = null;
let activeTab = 'dashboard';
let usersList = [];

// Delete confirm variables
let deleteConfirmCallback = null;
let currentConfirmCode = '';

// Assignees search widget variables
let selectedAssigneeIds = [];

// DB Admin state
let currentDbTable = '';
let currentDbSchema = [];
let currentDbRows = [];
let editingDbRowId = null;

// Initialize App
window.initApp = async function() {
  await loadUsersList();
  await loadPlans();
  initAssigneesPillbox();
  initDbAdminEvents();
  setupGlobalEvents();
  setupKpiTypeDefaultListeners();
};

// ----------------------------------------------------
// DATA LOADERS & RENDERERS
// ----------------------------------------------------

// Load Strategic Plans list
async function loadPlans() {
  try {
    const res = await fetch('/api/plans');
    const plans = await res.json();
    const select = document.getElementById('plan-select');
    select.innerHTML = '';

    plans.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.innerText = p.name;
      select.appendChild(opt);
    });

    // Populate plan select inside structure modal too
    populateMissionsDropdown();

    if (plans.length > 0) {
      selectedPlanId = plans[0].id;
      document.getElementById('current-plan-title').innerText = plans[0].name;
      
      // Setup admin actions for selected plan
      const adminActions = document.getElementById('admin-plan-actions');
      if (adminActions) {
        if (window.currentUser && window.currentUser.role === 'admin') {
          adminActions.style.display = 'block';
          renderPlanAdminActions();
        } else {
          adminActions.style.display = 'none';
        }
      }

      await loadHierarchyTree(selectedPlanId);
      await loadDashboardStats(selectedPlanId);
    }
  } catch (err) {
    console.error('Failed to load strategic plans:', err);
  }
}

// Render Edit/Delete plan buttons in sidebar
function renderPlanAdminActions() {
  const container = document.getElementById('admin-plan-actions');
  container.innerHTML = `
    <div class="plan-actions-wrapper">
      <button id="add-plan-btn" class="btn btn-secondary" style="flex: 1; padding: 6px 12px; font-size: 11px;">
        <i data-lucide="plus" style="width: 13px; height: 13px;"></i> เพิ่มแผน
      </button>
      <button id="edit-plan-btn" class="btn btn-secondary" style="padding: 6px 10px; font-size: 11px;" title="แก้ไขชื่อ/ปีแผนปัจจุบัน">
        <i data-lucide="edit" style="width: 13px; height: 13px;"></i>
      </button>
      <button id="delete-plan-btn" class="btn btn-secondary" style="padding: 6px 10px; font-size: 11px; border-color: #fca5a5; color: #ef4444;" title="ลบแผนปัจจุบัน">
        <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
      </button>
    </div>
  `;
  
  // Re-bind events
  document.getElementById('add-plan-btn').addEventListener('click', () => openPlanModal(null));
  document.getElementById('edit-plan-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/plans');
      const plans = await res.json();
      const currentPlan = plans.find(p => p.id === parseInt(selectedPlanId));
      if (currentPlan) {
        openPlanModal(currentPlan);
      }
    } catch (e) {
      console.error(e);
    }
  });
  
  document.getElementById('delete-plan-btn').addEventListener('click', () => {
    const planName = document.getElementById('plan-select').options[document.getElementById('plan-select').selectedIndex].text;
    openDeleteConfirmModal(`คุณแน่ใจว่าจะลบแผนกลยุทธ์ "${planName}" หรือไม่?\nการลบนี้จะทำการลบทุกพันธกิจ กลยุทธ์ กิจกรรม และขั้นตอนย่อยภายใต้แผนนี้ทั้งหมดโดยถาวร!`, async () => {
      try {
        const res = await fetch(`/api/plans/${selectedPlanId}`, { method: 'DELETE' });
        if (res.ok) {
          alert('ลบแผนกลยุทธ์เรียบร้อยแล้ว');
          await loadPlans();
        } else {
          alert('ลบล้มเหลว');
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      }
    });
  });
  
  lucide.createIcons();
}

// Load Users list (for assignment dropdowns and management)
async function loadUsersList() {
  try {
    const res = await fetch('/api/users');
    usersList = await res.json();
    
    // Populate Managers dropdown in Structure Node Modal
    const mgrSelect = document.getElementById('node-manager-select');
    if (mgrSelect) {
      mgrSelect.innerHTML = '<option value="">-- เลือกผู้บริหาร --</option>';
      usersList.filter(u => u.role === 'manager').forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.innerText = u.name;
        mgrSelect.appendChild(opt);
      });
    }

    // Load User management table if active
    if (activeTab === 'user-management') {
      renderUserManagementTable();
    }
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

// Load Hierarchy tree for the sidebar (Missions -> Strategies)
async function loadHierarchyTree(planId) {
  try {
    const res = await fetch(`/api/plans/${planId}/hierarchy`);
    const hierarchy = await res.json();
    const container = document.getElementById('hierarchy-tree');
    container.innerHTML = '';

    if (hierarchy.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px 0;">
          ยังไม่มีโครงสร้างแผนในระบบ
        </div>
      `;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'tree-list';

    const isAdmin = window.currentUser && window.currentUser.role === 'admin';

    hierarchy.forEach(m => {
      const mItem = document.createElement('li');
      mItem.className = 'tree-item';
      
      const mLink = document.createElement('div');
      mLink.className = 'tree-link';
      
      let mActionsHtml = '';
      if (isAdmin) {
        mActionsHtml = `
          <div class="tree-actions">
            <button class="tree-action-btn edit-mission-btn" title="แก้ไขพันธกิจ" data-id="${m.id}" data-seq="${m.seq}" data-name="${m.name}">
              <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
            </button>
            <button class="tree-action-btn delete delete-mission-btn" title="ลบพันธกิจ" data-id="${m.id}" data-name="พันธกิจที่ ${m.seq}">
              <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
        `;
      }

      mLink.innerHTML = `
        <i data-lucide="award" style="width: 16px; height: 16px;"></i>
        <span style="font-weight: 600;">พันธกิจที่ ${m.seq}</span>
        ${mActionsHtml}
        <i data-lucide="chevron-right" style="width: 14px; height: 14px; margin-left: 4px; transition: transform var(--transition-fast);"></i>
      `;
      
      const subUl = document.createElement('ul');
      subUl.className = 'tree-sub-list';

      // Strategies loop (directly clickable now to open Workspace)
      if (m.strategies && m.strategies.length > 0) {
        m.strategies.forEach(s => {
          const sItem = document.createElement('li');
          sItem.className = 'tree-item';
          
          let sActionsHtml = '';
          if (isAdmin) {
            sActionsHtml = `
              <div class="tree-actions">
                <button class="tree-action-btn edit-strategy-btn" title="แก้ไขกลยุทธ์" 
                        data-id="${s.id}" data-seq="${s.seq}" data-name="${s.name}" 
                        data-action-plan="${s.action_plan_name || ''}" data-objectives="${s.objective_name || ''}" 
                        data-manager-id="${s.manager_id || ''}" data-mission-id="${m.id}">
                  <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
                </button>
                <button class="tree-action-btn delete delete-strategy-btn" title="ลบกลยุทธ์" data-id="${s.id}" data-name="กลยุทธ์ที่ ${s.seq}">
                  <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                </button>
              </div>
            `;
          }

          const sLink = document.createElement('div');
          sLink.className = 'tree-link tree-sub-link';
          sLink.style.paddingLeft = '20px';
          sLink.dataset.id = s.id;
          sLink.dataset.mName = `พันธกิจที่ ${m.seq}: ${m.name}`;
          sLink.dataset.sName = `กลยุทธ์ที่ ${s.seq}: ${s.name}`;
          sLink.dataset.actionPlan = s.action_plan_name || 'ไม่ระบุ';
          sLink.dataset.objective = s.objective_name || 'ไม่ระบุ';
          sLink.dataset.managerName = s.manager_name || 'ไม่ระบุ';
          
          sLink.innerHTML = `
            <i data-lucide="compass" style="width: 15px; height: 15px; flex-shrink: 0; color: var(--primary);"></i>
            <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">กลยุทธ์ที่ ${s.seq}: ${s.name}</span>
            ${sActionsHtml}
          `;
          
          sLink.addEventListener('click', (e) => {
            if (e.target.closest('.tree-action-btn')) return; // ignore edit/delete clicks
            e.stopPropagation();
            // Mark active
            document.querySelectorAll('.tree-sub-link').forEach(el => el.classList.remove('active'));
            sLink.classList.add('active');
            
            // Load Workspace
            openStrategyWorkspace(s.id, {
              mName: sLink.dataset.mName,
              sName: sLink.dataset.sName,
              actionPlanName: sLink.dataset.actionPlan,
              objectiveName: sLink.dataset.objective,
              managerName: sLink.dataset.managerName
            });
          });

          sItem.appendChild(sLink);
          subUl.appendChild(sItem);
        });
      } else {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'tree-link';
        emptyItem.style.paddingLeft = '20px';
        emptyItem.style.color = 'var(--text-muted)';
        emptyItem.innerText = '(ไม่มีกลยุทธ์)';
        subUl.appendChild(emptyItem);
      }

      // Toggle mission sub-items
      mLink.addEventListener('click', (e) => {
        if (e.target.closest('.tree-action-btn')) return;
        const icon = mLink.querySelector('[data-lucide="chevron-right"]');
        const isOpen = subUl.classList.toggle('open');
        if (icon) icon.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
      });

      mItem.appendChild(mLink);
      mItem.appendChild(subUl);
      ul.appendChild(mItem);
    });

    container.appendChild(ul);
    
    // Bind edit/delete handlers in tree (Admin only)
    if (isAdmin) {
      // Edit Mission
      document.querySelectorAll('.edit-mission-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const node = {
            id: btn.dataset.id,
            type: 'mission',
            seq: btn.dataset.seq,
            name: btn.dataset.name
          };
          openStructureNodeModal('mission', node);
        });
      });

      // Delete Mission
      document.querySelectorAll('.delete-mission-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const name = btn.dataset.name;
          openDeleteConfirmModal(`คุณต้องการลบ "${name}" หรือไม่?\nการลบนี้จะทำการลบกลยุทธ์และกิจกรรมย่อยที่เกี่ยวข้องทั้งหมดด้วย!`, async () => {
            try {
              const res = await fetch(`/api/missions/${id}`, { method: 'DELETE' });
              if (res.ok) {
                alert('ลบพันธกิจเรียบร้อยแล้ว');
                loadHierarchyTree(selectedPlanId);
                loadDashboardStats(selectedPlanId);
              }
            } catch (err) {
              alert('เกิดข้อผิดพลาดในการลบข้อมูล');
            }
          });
        });
      });

      // Edit Strategy
      document.querySelectorAll('.edit-strategy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const node = {
            id: btn.dataset.id,
            type: 'strategy',
            seq: btn.dataset.seq,
            name: btn.dataset.name,
            mission_id: btn.dataset.missionId,
            manager_id: btn.dataset.managerId,
            action_plan_name: btn.dataset.actionPlan,
            objective_name: btn.dataset.objectives
          };
          openStructureNodeModal('strategy', node);
        });
      });

      // Delete Strategy
      document.querySelectorAll('.delete-strategy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const name = btn.dataset.name;
          openDeleteConfirmModal(`คุณต้องการลบ "${name}" หรือไม่?\nการลบนี้จะลบกิจกรรมหลักและขั้นตอนการทำงานด้านในกลยุทธ์นี้ทั้งหมด!`, async () => {
            try {
              const res = await fetch(`/api/strategies/${id}`, { method: 'DELETE' });
              if (res.ok) {
                alert('ลบกลยุทธ์เรียบร้อยแล้ว');
                loadHierarchyTree(selectedPlanId);
                loadDashboardStats(selectedPlanId);
              }
            } catch (err) {
              alert('เกิดข้อผิดพลาดในการลบข้อมูล');
            }
          });
        });
      });
    }

    lucide.createIcons();
  } catch (err) {
    console.error('Failed to load hierarchy tree:', err);
  }
}

// Populate parent mission dropdown inside the Node modal
async function populateMissionsDropdown() {
  const select = document.getElementById('node-parent-select');
  if (!select) return;
  select.innerHTML = '<option value="">-- กรุณาเลือกพันธกิจ --</option>';
  try {
    const res = await fetch(`/api/plans/${selectedPlanId}/hierarchy`);
    const hierarchy = await res.json();
    hierarchy.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.innerText = `พันธกิจที่ ${m.seq}: ${m.name}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to populate missions dropdown:', err);
  }
}

// ----------------------------------------------------
// WORKSPACE MANAGEMENT (KPI & ACTIVITIES ACTIONS)
// ----------------------------------------------------

function openStrategyWorkspace(strategyId, details) {
  selectedStrategyId = strategyId;
  
  // Show header details
  document.getElementById('workspace-empty-state').style.display = 'none';
  document.getElementById('workspace-header-block').style.display = 'block';
  
  document.getElementById('breadcrumb-mission').innerText = details.mName;
  document.getElementById('breadcrumb-strategy').innerText = details.sName;
  document.getElementById('objective-display-name').innerText = details.sName;
  
  // Show Strategy Metadata
  document.getElementById('metadata-action-plan').innerText = details.actionPlanName;
  document.getElementById('metadata-objectives').innerText = details.objectiveName;
  document.getElementById('metadata-manager').innerText = details.managerName;

  // Manage permissions
  if (window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'manager')) {
    document.getElementById('create-activity-btn').style.display = 'inline-flex';
  } else {
    document.getElementById('create-activity-btn').style.display = 'none';
  }

  // Switch tab visually
  switchTab('workspace');

  // Load activities list
  loadStrategyActivities(strategyId);
}

async function loadStrategyActivities(strategyId) {
  const container = document.getElementById('activities-list-container');
  container.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); font-size: 14px; padding: 40px 0;">
      กำลังโหลดรายการกิจกรรม...
    </div>
  `;

  try {
    const res = await fetch(`/api/strategies/${strategyId}/activities`);
    const activities = await res.json();
    container.innerHTML = '';

    if (activities.length === 0) {
      container.innerHTML = `
        <div class="empty-workspace-state">
          <i data-lucide="clipboard" class="empty-workspace-icon" style="width: 40px; height: 40px;"></i>
          <h4>ยังไม่มีกิจกรรม/ตัวชี้วัดบันทึก</h4>
          <p style="margin-top: 4px; font-size: 13px;">หัวข้อกลยุทธ์นี้ยังไม่มีตัวชี้วัดหรือกิจกรรมเพิ่มเข้ามาในแผนงาน</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    activities.forEach(act => {
      const card = renderActivityCard(act);
      container.appendChild(card);
    });

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: #ef4444; font-size: 14px; padding: 20px 0;">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}</div>`;
  }
}

// Render dynamic activity card
function renderActivityCard(act, isPersonalTasksView = false) {
  const card = document.createElement('div');
  card.className = 'activity-card';
  card.dataset.id = act.id;

  // Check if current user has permission to update this activity (is assignee or manager/admin)
  const isAssignee = act.assignees.some(u => u.id === window.currentUser.id);
  const isManagerOrAdmin = window.currentUser.role === 'admin' || window.currentUser.role === 'manager';
  const hasUpdatePermission = isAssignee || isManagerOrAdmin;

  // Formatting strings
  const getBadgeClass = (status) => `badge-${status || 'pending'}`;
  const getBadgeText = (status) => {
    switch (status) {
      case 'pending': return 'รอดำเนินการ';
      case 'in_progress': return 'กำลังทำ';
      case 'completed': return 'เสร็จสิ้น';
      case 'delayed': return 'ล่าช้า';
      default: return 'รอดำเนินการ';
    }
  };
  const getHealthClass = (health) => `health-${health || 'ontrack'}`;
  const getHealthText = (health) => {
    switch (health) {
      case 'on_track': return 'ปกติ';
      case 'at_risk': return 'เสี่ยง';
      case 'off_track': return 'ล่าช้า/วิกฤต';
      default: return 'ปกติ';
    }
  };

  // Build breadcrumb if we are in personal tasks view
  const breadcrumbHtml = isPersonalTasksView 
    ? `<div class="task-parent-breadcrumb" style="font-size: 11px; color: var(--primary); font-weight: 600; margin-bottom: 4px;">
        ${act.plan_name} / พันธกิจที่ ${act.mission_name.match(/\d+/)} / ${act.action_plan_name || 'แผนงานไม่ระบุ'}
       </div>` 
    : '';

  card.innerHTML = `
    <div class="activity-card-header">
      <div class="activity-title-group">
        <span class="activity-seq">#${act.seq}</span>
        <div style="min-width: 0; flex: 1;">
          ${breadcrumbHtml}
          <h4 class="activity-title" title="${act.kpi_name}">${act.kpi_name}</h4>
          <span style="font-size: 12px; color: var(--text-muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <strong>รายละเอียดกิจกรรม (KPI Detail):</strong> ${act.activity}
          </span>
        </div>
      </div>
      <div class="activity-meta-pills">
        <span class="badge ${getBadgeClass(act.progress_status)}">${getBadgeText(act.progress_status)}</span>
        <div style="display: flex; align-items: center; gap: var(--space-xs); font-size: 12px; color: var(--text-muted);">
          <span class="health-indicator ${getHealthClass(act.health_status)}"></span>
          <span>${getHealthText(act.health_status)}</span>
        </div>
        <div style="width: 80px; display: flex; flex-direction: column; gap: 2px;">
          <div class="progress-container" style="height: 6px;">
            <div class="progress-fill" style="width: ${act.progress_percent}%;"></div>
          </div>
          <span style="font-size: 10px; font-weight: 600; text-align: right; color: var(--primary);">${act.progress_percent}%</span>
        </div>
        <i data-lucide="chevron-down" style="width: 18px; height: 18px; color: var(--text-muted); margin-left: 4px;"></i>
      </div>
    </div>

    <div class="activity-card-body">
      <div class="activity-details-layout">
        
        <!-- Left Side: Sub-steps & Target settings -->
        <div class="activity-details-left">
          
          <!-- Sub-steps (Milestones) List -->
          <div>
            <div class="detail-section-title">
              <span>ขั้นตอนการดำเนินงาน (Sub-steps)</span>
              ${hasUpdatePermission ? `
                <button class="btn btn-secondary add-step-btn-inline" style="padding: 4px 8px; font-size: 11px;">
                  <i data-lucide="plus" style="width: 12px; height: 12px;"></i> เพิ่มขั้นตอนย่อย
                </button>
              ` : ''}
            </div>
            
            <div class="steps-checklist-list">
              <!-- Rendered Dynamically inside JS -->
            </div>
          </div>
        </div>

        <!-- Right Side: Schedule, Budget, Assignees, Operations -->
        <div class="activity-details-right">
          
          <!-- Target Comparison Block -->
          <div>
            <span class="form-label">ผลสำเร็จของตัวชี้วัด (KPI Result)</span>
            <div style="display: flex; align-items: center; justify-content: space-between; background-color: var(--bg-app); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-sm) var(--space-md); margin-top: 4px;">
              <div>
                <span style="font-size: 11px; color: var(--text-muted); display: block;">เป้าหมาย (Target)</span>
                <span style="font-weight: 700; font-size: 16px; color: var(--text-main);">${act.target_value || '0'}</span>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 11px; color: var(--text-muted); display: block;">ผลการดำเนินงานจริง</span>
                ${hasUpdatePermission ? `
                  <input type="text" class="form-control act-actual-value-field" style="width: 90px; text-align: right; padding: 4px 8px; font-size: 14px; font-weight: bold;" value="${act.actual_value || ''}" placeholder="ระบุตัวเลข">
                ` : `
                  <span style="font-weight: 700; font-size: 16px; color: var(--primary);">${act.actual_value || 'ยังไม่มีการบันทึก'}</span>
                `}
              </div>
            </div>
          </div>

          <!-- Timeline -->
          <div style="margin-top: var(--space-xs);">
            <span class="form-label">กำหนดเวลาดำเนินงาน</span>
            <span style="font-size: 13px; font-weight: 500; display: block; margin-top: 2px;">
              <i data-lucide="calendar" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px; color: var(--text-muted);"></i>
              ${act.start_date || 'ไม่ระบุ'} ถึง ${act.end_date || 'ไม่ระบุ'}
            </span>
          </div>

          <!-- Budget allocated vs spent -->
          <div style="margin-top: var(--space-xs);">
            <span class="form-label">การบริหารงบประมาณ</span>
            <div class="input-row" style="gap: var(--space-sm); margin-top: 2px;">
              <div>
                <span style="font-size: 11px; color: var(--text-muted); display: block;">งบจัดสรร</span>
                <span style="font-size: 13px; font-weight: 600;">฿${(act.budget_allocated || 0).toLocaleString()}</span>
              </div>
              <div>
                <span style="font-size: 11px; color: var(--text-muted); display: block;">งบใช้จริง</span>
                ${hasUpdatePermission ? `
                  <input type="number" class="form-control act-budget-spent-field" style="padding: 4px 8px; font-size: 12px;" value="${act.budget_spent || 0}" min="0">
                ` : `
                  <span style="font-size: 13px; font-weight: 600; color: var(--secondary);">฿${(act.budget_spent || 0).toLocaleString()}</span>
                `}
              </div>
            </div>
          </div>

          <!-- Project Health Status -->
          <div style="margin-top: var(--space-xs);">
            <span class="form-label">สถานะภาพโครงการ (Project Health)</span>
            ${hasUpdatePermission ? `
              <select class="form-control act-health-field" style="padding: 6px; font-size: 12px; margin-top: 2px;">
                <option value="on_track" ${act.health_status === 'on_track' ? 'selected' : ''}>ปกติ (On Track)</option>
                <option value="at_risk" ${act.health_status === 'at_risk' ? 'selected' : ''}>มีความเสี่ยง (At Risk)</option>
                <option value="off_track" ${act.health_status === 'off_track' ? 'selected' : ''}>ล่าช้า/วิกฤต (Off Track)</option>
              </select>
            ` : `
              <span style="font-size: 13px; font-weight: 600; display: block; margin-top: 2px;">
                <span class="health-indicator ${getHealthClass(act.health_status)}"></span>
                ${getHealthText(act.health_status)}
              </span>
            `}
          </div>

          <!-- Overall Status -->
          <div style="margin-top: var(--space-xs);">
            <span class="form-label">สถานะการดำเนินงาน (Status)</span>
            ${hasUpdatePermission ? `
              <select class="form-control act-status-field" style="padding: 6px; font-size: 12px; margin-top: 2px;">
                <option value="pending" ${act.progress_status === 'pending' ? 'selected' : ''}>รอดำเนินการ (Pending)</option>
                <option value="in_progress" ${act.progress_status === 'in_progress' ? 'selected' : ''}>กำลังดำเนินการ (In Progress)</option>
                <option value="completed" ${act.progress_status === 'completed' ? 'selected' : ''}>เสร็จสมบูรณ์ (Completed)</option>
                <option value="delayed" ${act.progress_status === 'delayed' ? 'selected' : ''}>ล่าช้า (Delayed)</option>
              </select>
            ` : `
              <span class="badge ${getBadgeClass(act.progress_status)}" style="margin-top: 4px;">${getBadgeText(act.progress_status)}</span>
            `}
          </div>

          <!-- Assignees list -->
          <div style="margin-top: var(--space-xs);">
            <span class="form-label">ผู้รับผิดชอบร่วม</span>
            <div class="assignees-avatars-list">
              ${act.assignees.map(u => `
                <div class="assignee-avatar-tag" title="${u.role}">
                  <i data-lucide="user" style="width: 12px; height: 12px; color: var(--primary);"></i>
                  <span>${u.name}</span>
                </div>
              `).join('')}
              ${act.assignees.length === 0 ? '<span style="font-size: 12px; color: var(--text-muted); font-style: italic;">ไม่มีผู้รับผิดชอบ</span>' : ''}
            </div>
          </div>

          <!-- Action operations inside card footer -->
          <div style="margin-top: var(--space-md); display: flex; gap: var(--space-sm); justify-content: flex-end;">
            ${isManagerOrAdmin && !isPersonalTasksView ? `
              <button class="btn btn-secondary edit-activity-btn" style="padding: 6px 10px; font-size: 12px;" title="แก้ไขกิจกรรม">
                <i data-lucide="edit" style="width: 14px; height: 14px;"></i>
              </button>
              <button class="btn btn-secondary delete-activity-btn" style="padding: 6px 10px; font-size: 12px; border-color: #fca5a5; color: #ef4444;" title="ลบกิจกรรม">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
              </button>
            ` : ''}
            ${hasUpdatePermission ? `
              <button class="btn btn-primary save-activity-updates-btn" style="padding: 6px 14px; font-size: 12px;">
                <i data-lucide="save" style="width: 14px; height: 14px;"></i> บันทึกข้อมูล
              </button>
            ` : ''}
          </div>

        </div>
      </div>
    </div>
  `;

  // Toggle card body expand/collapse
  const header = card.querySelector('.activity-card-header');
  const body = card.querySelector('.activity-card-body');
  const icon = header.querySelector('[data-lucide="chevron-down"]');
  
  header.addEventListener('click', (e) => {
    if (e.target.closest('.tree-action-btn') || e.target.closest('.badge')) return;
    const isOpen = body.classList.toggle('open');
    if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
  });

  // Render sub-steps inside checklist container
  const stepsContainer = card.querySelector('.steps-checklist-list');
  const localSteps = [...act.steps];

  function renderStepsChecklist() {
    stepsContainer.innerHTML = '';
    
    if (localSteps.length === 0) {
      stepsContainer.innerHTML = '<span style="font-size: 13px; color: var(--text-muted); font-style: italic;">ไม่มีขั้นตอนย่อยดำเนินงาน (หากต้องการใส่เปอร์เซ็นต์กิจกรรมหลัก ให้ป้อนค่าสำเร็จจริง หรือกดปุ่มเพิ่มขั้นตอนย่อยด้านบน)</span>';
      return;
    }

    localSteps.forEach((step, index) => {
      const stepItem = document.createElement('div');
      stepItem.className = 'step-checklist-item';
      stepItem.style.flexDirection = 'column';
      stepItem.style.alignItems = 'stretch';
      stepItem.style.gap = '8px';
      
      stepItem.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm);">
          <div class="step-left" style="flex: 1;">
            <i data-lucide="check-square" style="width: 16px; height: 16px; color: ${step.progress_percent === 100 ? 'var(--status-completed)' : 'var(--text-muted)'}; flex-shrink: 0;"></i>
            ${hasUpdatePermission ? `
              <input type="text" class="form-control step-name-input-field" style="padding: 4px 8px; font-size: 13px; border: none; border-bottom: 1px dashed var(--border); width: 100%;" value="${step.step_name}" placeholder="ชื่อขั้นตอนย่อย...">
            ` : `
              <span class="step-name-text">${step.step_name}</span>
            `}
          </div>
          <div class="step-percent-slider-container">
            <input type="range" class="step-slider" min="0" max="100" value="${step.progress_percent}" ${!hasUpdatePermission ? 'disabled' : ''}>
            <span class="step-percent-badge">${step.progress_percent}%</span>
          </div>
          ${hasUpdatePermission ? `
            <button class="icon-btn remove-step-btn-inline" style="width: 28px; height: 28px; border: none;" title="ลบขั้นตอนย่อย">
              <i data-lucide="trash" style="width: 14px; height: 14px; color: #ef4444;"></i>
            </button>
          ` : ''}
        </div>
        <div style="padding-left: 24px; display: flex; flex-direction: column; gap: 2px;">
          <label style="font-size: 11px; color: var(--text-muted); font-weight: 500;">รายงานผลการดำเนินการย่อย (Step Actual Result)</label>
          ${hasUpdatePermission ? `
            <textarea class="form-control step-result-input-field" rows="1" style="font-size: 12px; padding: 4px 8px;" placeholder="พิมพ์ความคืบหน้าของขั้นตอนย่อยนี้...">${step.actual_result || ''}</textarea>
          ` : `
            <div style="font-size: 12px; color: var(--text-main); background-color: var(--bg-app); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              ${step.actual_result || '<span style="color: var(--text-muted); font-style: italic;">ยังไม่ได้บันทึกความก้าวหน้าย่อย</span>'}
            </div>
          `}
        </div>
      `;

      // Slider update event
      const slider = stepItem.querySelector('.step-slider');
      const badge = stepItem.querySelector('.step-percent-badge');
      const checkIcon = stepItem.querySelector('[data-lucide="check-square"]');
      
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        badge.innerText = `${val}%`;
        step.progress_percent = val;
        
        if (checkIcon) {
          checkIcon.style.color = val === 100 ? 'var(--status-completed)' : 'var(--text-muted)';
        }
        
        // Recalculate average progress bar in card header dynamically
        const sum = localSteps.reduce((acc, curr) => acc + curr.progress_percent, 0);
        const avg = Math.round(sum / localSteps.length);
        const progressFill = card.querySelector('.activity-meta-pills .progress-fill');
        const progressText = card.querySelector('.activity-meta-pills span[style*="text-align: right"]');
        if (progressFill) progressFill.style.width = `${avg}%`;
        if (progressText) progressText.innerText = `${avg}%`;
      });

      // Name edit event
      const nameInput = stepItem.querySelector('.step-name-input-field');
      if (nameInput) {
        nameInput.addEventListener('change', (e) => {
          step.step_name = e.target.value.trim();
        });
      }

      // Step actual result change event
      const resultInput = stepItem.querySelector('.step-result-input-field');
      if (resultInput) {
        resultInput.addEventListener('change', (e) => {
          step.actual_result = e.target.value.trim();
        });
      }

      // Remove step event
      const removeBtn = stepItem.querySelector('.remove-step-btn-inline');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          localSteps.splice(index, 1);
          renderStepsChecklist();
          
          // Re-calculate progress bar
          const sum = localSteps.reduce((acc, curr) => acc + curr.progress_percent, 0);
          const avg = localSteps.length > 0 ? Math.round(sum / localSteps.length) : (act.progress_status === 'completed' ? 100 : 0);
          const progressFill = card.querySelector('.activity-meta-pills .progress-fill');
          const progressText = card.querySelector('.activity-meta-pills span[style*="text-align: right"]');
          if (progressFill) progressFill.style.width = `${avg}%`;
          if (progressText) progressText.innerText = `${avg}%`;
        });
      }

      stepsContainer.appendChild(stepItem);
    });

    lucide.createIcons();
  }

  // Bind add new sub-step inline
  const addStepBtn = card.querySelector('.add-step-btn-inline');
  if (addStepBtn) {
    addStepBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      localSteps.push({
        step_name: `ขั้นตอนย่อยที่ ${localSteps.length + 1}`,
        progress_percent: 0,
        actual_result: '',
        due_date: act.end_date || ''
      });
      renderStepsChecklist();
    });
  }

  // Bind Save update handler
  const saveBtn = card.querySelector('.save-activity-updates-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.innerText = 'กำลังบันทึก...';

      const actualValueInput = card.querySelector('.act-actual-value-field');
      const actualValue = actualValueInput ? actualValueInput.value.trim() : act.actual_value;
      const budgetSpentInput = card.querySelector('.act-budget-spent-field');
      const budgetSpent = budgetSpentInput ? parseFloat(budgetSpentInput.value) || 0 : act.budget_spent;
      const healthInput = card.querySelector('.act-health-field');
      const healthStatus = healthInput ? healthInput.value : act.health_status;
      const statusInput = card.querySelector('.act-status-field');
      const progressStatus = statusInput ? statusInput.value : act.progress_status;

      try {
        const res = await fetch(`/api/activities/${act.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            actual_value: actualValue,
            budget_spent: budgetSpent,
            health_status: healthStatus,
            progress_status: progressStatus,
            steps: localSteps
          })
        });

        if (res.ok) {
          alert('บันทึกข้อมูลและอัปเดตเปอร์เซ็นต์ความก้าวหน้าเรียบร้อยแล้ว');
          
          if (isPersonalTasksView) {
            loadMyTasksList();
          } else {
            loadStrategyActivities(act.strategy_id);
          }
          loadDashboardStats(selectedPlanId);
        } else {
          const err = await res.json();
          alert('บันทึกล้มเหลว: ' + err.error);
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-lucide="save" style="width: 14px; height: 14px;"></i> บันทึกข้อมูล';
        lucide.createIcons();
      }
    });
  }

  // Bind Admin/Manager actions (Edit/Delete)
  const editBtn = card.querySelector('.edit-activity-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      openActivityModal(act);
    });
  }

  const deleteBtn = card.querySelector('.delete-activity-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      openDeleteConfirmModal(`คุณแน่ใจว่าต้องการลบกิจกรรม/ตัวชี้วัด "${act.kpi_name}" ใช่หรือไม่?\nข้อมูลการรับผิดชอบ ขั้นตอนย่อย และความก้าวหน้าทั้งหมดจะสูญหายโดยถาวร`, async () => {
        try {
          const res = await fetch(`/api/activities/${act.id}`, { method: 'DELETE' });
          if (res.ok) {
            alert('ลบกิจกรรมเรียบร้อยแล้ว');
            loadStrategyActivities(act.strategy_id);
            loadDashboardStats(selectedPlanId);
          } else {
            alert('ลบล้มเหลว');
          }
        } catch (err) {
          alert('เกิดข้อผิดพลาดในการลบข้อมูล');
        }
      });
    });
  }

  // Render steps initially
  renderStepsChecklist();

  return card;
}

// ----------------------------------------------------
// MY TASKS PERSONAL LIST
// ----------------------------------------------------

async function loadMyTasksList() {
  const container = document.getElementById('my-tasks-container');
  container.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); font-size: 14px; padding: 40px 0;">
      กำลังโหลดงานที่คุณได้รับมอบหมาย...
    </div>
  `;

  try {
    const res = await fetch('/api/my-tasks');
    const tasks = await res.json();
    container.innerHTML = '';

    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="my-tasks-empty-state">
          <i data-lucide="check-circle-2" class="empty-workspace-icon" style="width: 48px; height: 48px; color: var(--health-ontrack);"></i>
          <h3>ไม่มีงานค้างรับผิดชอบ</h3>
          <p style="margin-top: 6px; font-size: 14px;">คุณยังไม่ได้รับมอบหมายให้เป็นผู้รับผิดชอบหลักในกิจกรรมติดตามใดๆ ในช่วงแผนนี้</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    tasks.forEach(task => {
      const card = renderActivityCard(task, true);
      container.appendChild(card);
    });

    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: #ef4444; font-size: 14px; padding: 20px 0;">เกิดข้อผิดพลาด: ${err.message}</div>`;
  }
}

// ----------------------------------------------------
// USER MANAGEMENT PANEL (Admin Only)
// ----------------------------------------------------

function renderUserManagementTable() {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';

  usersList.forEach(u => {
    const tr = document.createElement('tr');
    
    let roleText = 'ผู้ใช้ทั่วไป (User)';
    if (u.role === 'admin') roleText = 'ผู้ดูแลระบบ (Admin)';
    if (u.role === 'manager') roleText = 'ผู้บริหาร (Manager)';

    tr.innerHTML = `
      <td style="font-weight: 500;">${u.name}</td>
      <td><code>${u.username}</code></td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-completed' : (u.role === 'manager' ? 'badge-progress' : 'badge-pending')}">${roleText}</span></td>
      <td style="text-align: right;">
        <button class="icon-btn edit-user-btn" style="margin-right: 4px;" title="แก้ไขผู้ใช้"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>
        <button class="icon-btn delete-user-btn" style="color: #ef4444; border-color: #fca5a5;" title="ลบผู้ใช้"><i data-lucide="user-minus" style="width: 14px; height: 14px;"></i></button>
      </td>
    `;

    // Bind edit
    tr.querySelector('.edit-user-btn').addEventListener('click', () => {
      openUserModal(u);
    });

    // Bind delete
    tr.querySelector('.delete-user-btn').addEventListener('click', () => {
      openDeleteConfirmModal(`คุณต้องการลบบัญชีผู้ใช้งาน "${u.name}" ใช่หรือไม่?\nสิทธิ์การเข้าถึงทั้งหมดจะถูกทำลายโดยถาวร`, async () => {
        try {
          const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
          if (res.ok) {
            alert('ลบผู้ใช้งานเสร็จสิ้น');
            await loadUsersList();
          } else {
            const err = await res.json();
            alert(err.error);
          }
        } catch (err) {
          alert('เกิดข้อผิดพลาดในการลบผู้ใช้งาน');
        }
      });
    });

    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

// ----------------------------------------------------
// SEARCHABLE MULTI-SELECT PILLBOX (ASSIGNEES)
// ----------------------------------------------------

function initAssigneesPillbox() {
  const searchInput = document.getElementById('assignees-search-input');
  const dropdown = document.getElementById('assignees-dropdown');
  
  if (!searchInput) return;

  searchInput.addEventListener('focus', () => {
    triggerAssigneesFilter('');
  });

  searchInput.addEventListener('input', (e) => {
    triggerAssigneesFilter(e.target.value);
  });

  function triggerAssigneesFilter(query) {
    const term = query.toLowerCase().trim();
    const filtered = usersList.filter(u => 
      !selectedAssigneeIds.includes(u.id) && 
      (u.name.toLowerCase().includes(term) || u.username.toLowerCase().includes(term))
    );

    dropdown.innerHTML = '';
    if (filtered.length === 0) {
      dropdown.innerHTML = '<li class="tag-search-dropdown-item" style="color: var(--text-muted); cursor: default;">ไม่พบผลการค้นหา</li>';
    } else {
      filtered.forEach(u => {
        const li = document.createElement('li');
        li.className = 'tag-search-dropdown-item';
        li.innerText = `${u.name} (${u.role})`;
        li.addEventListener('click', () => {
          selectedAssigneeIds.push(u.id);
          renderAssigneeTags();
          searchInput.value = '';
          dropdown.classList.remove('show');
        });
        dropdown.appendChild(li);
      });
    }
    dropdown.classList.add('show');
  }

  // Close dropdown when click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#assignees-widget')) {
      dropdown.classList.remove('show');
    }
  });
}

function renderAssigneeTags() {
  const container = document.getElementById('assignees-tags');
  container.innerHTML = '';

  selectedAssigneeIds.forEach(id => {
    const user = usersList.find(u => u.id === id);
    if (!user) return;

    const pill = document.createElement('div');
    pill.className = 'tag-pill';
    pill.innerHTML = `
      <span>${user.name}</span>
      <button type="button" class="tag-pill-remove">&times;</button>
    `;
    
    pill.querySelector('.tag-pill-remove').addEventListener('click', () => {
      selectedAssigneeIds = selectedAssigneeIds.filter(userId => userId !== id);
      renderAssigneeTags();
    });

    container.appendChild(pill);
  });

  document.getElementById('assignees-selected-ids').value = selectedAssigneeIds.join(',');
}

// ----------------------------------------------------
// DEFAULT TARGET VALUE GENERATORS
// ----------------------------------------------------

function setupKpiTypeDefaultListeners() {
  const typeSelect = document.getElementById('act-kpi-type');
  const targetInput = document.getElementById('act-target-value');

  if (!typeSelect || !targetInput) return;

  typeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    if (type === 'percentage') {
      targetInput.value = '100';
    } else if (type === 'numeric') {
      targetInput.value = '5';
    } else if (type === 'date') {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      targetInput.value = `${yyyy}-${mm}-${dd}`;
    }
  });
}

// ----------------------------------------------------
// DELETE CONFIRMATION MODAL LOGIC
// ----------------------------------------------------

function openDeleteConfirmModal(message, callback) {
  deleteConfirmCallback = callback;
  document.getElementById('delete-confirm-message').innerText = message;
  document.getElementById('delete-confirm-input').value = '';
  
  // Random code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  currentConfirmCode = '';
  for (let i = 0; i < 6; i++) {
    currentConfirmCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  document.getElementById('delete-confirm-code-display').innerText = currentConfirmCode;
  document.getElementById('delete-confirm-submit-btn').disabled = true;
  
  openModal('modal-delete-confirm');
}

// ----------------------------------------------------
// MODAL ACTIONS (Open / Close Forms)
// ----------------------------------------------------

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

// Plan Cycle creation/edit
function openPlanModal(plan = null) {
  const form = document.getElementById('plan-form');
  const title = document.getElementById('plan-modal-title');
  form.reset();

  if (plan) {
    title.innerText = 'แก้ไขข้อมูลแผนกลยุทธ์';
    document.getElementById('plan-id').value = plan.id;
    document.getElementById('plan-name-input').value = plan.name;
    document.getElementById('plan-start-year').value = plan.start_year;
    document.getElementById('plan-end-year').value = plan.end_year;
  } else {
    title.innerText = 'เพิ่มแผนกลยุทธ์ชุดใหม่';
    document.getElementById('plan-id').value = '';
  }

  openModal('modal-plan');
}

// Structure Node Modal (Mission / Strategy selection dropdowns)
async function openStructureNodeModal(forcedType = 'mission', existingNode = null) {
  const form = document.getElementById('node-form');
  form.reset();

  await populateMissionsDropdown();
  await loadUsersList(); // reload managers

  const typeSelect = document.getElementById('node-type-select');
  const parentGroup = document.getElementById('node-parent-group');
  const strategyMeta = document.getElementById('node-strategy-metadata');
  const title = document.getElementById('node-modal-title');

  // Show dropdown triggers handler
  function toggleTypeVisibility(typeVal) {
    if (typeVal === 'strategy') {
      parentGroup.style.display = 'block';
      strategyMeta.style.display = 'block';
      document.getElementById('node-parent-select').required = true;
    } else {
      parentGroup.style.display = 'none';
      strategyMeta.style.display = 'none';
      document.getElementById('node-parent-select').required = false;
    }
  }

  typeSelect.onchange = (e) => {
    toggleTypeVisibility(e.target.value);
  };

  if (existingNode) {
    title.innerText = existingNode.type === 'mission' ? 'แก้ไขข้อมูลพันธกิจ (Mission)' : 'แก้ไขข้อมูลกลยุทธ์ (Strategy)';
    document.getElementById('node-id').value = existingNode.id;
    
    typeSelect.value = existingNode.type;
    typeSelect.disabled = true; // block type modification on edit
    
    document.getElementById('node-seq-input').value = existingNode.seq;
    document.getElementById('node-name-input').value = existingNode.name;
    
    toggleTypeVisibility(existingNode.type);

    if (existingNode.type === 'strategy') {
      document.getElementById('node-parent-select').value = existingNode.mission_id || '';
      document.getElementById('node-manager-select').value = existingNode.manager_id || '';
      document.getElementById('node-action-plan-input').value = existingNode.action_plan_name || '';
      document.getElementById('node-objectives-input').value = existingNode.objective_name || '';
    }
  } else {
    title.innerText = forcedType === 'mission' ? 'เพิ่มพันธกิจ (Mission)' : 'เพิ่มกลยุทธ์ (Strategy)';
    document.getElementById('node-id').value = '';
    
    typeSelect.value = forcedType;
    typeSelect.disabled = false;
    
    toggleTypeVisibility(forcedType);
    
    // Assign next seq automatically
    document.getElementById('node-seq-input').value = 1; 
  }

  openModal('modal-node');
}

// Activity Create/Edit Modal
function openActivityModal(activity = null) {
  const modal = document.getElementById('modal-activity');
  const form = document.getElementById('activity-form');
  const title = document.getElementById('activity-modal-title');
  
  form.reset();
  
  if (activity) {
    title.innerText = 'แก้ไขข้อมูลกิจกรรม/ตัวชี้วัด';
    document.getElementById('activity-id').value = activity.id;
    document.getElementById('act-kpi-name').value = activity.kpi_name;
    document.getElementById('act-kpi-type').value = activity.kpi_type;
    document.getElementById('act-target-value').value = activity.target_value;
    document.getElementById('act-seq').value = activity.seq;
    document.getElementById('act-activity').value = activity.activity;
    document.getElementById('act-start-date').value = activity.start_date || '';
    document.getElementById('act-end-date').value = activity.end_date || '';
    document.getElementById('act-budget-allocated').value = activity.budget_allocated || 0;

    selectedAssigneeIds = activity.assignees.map(u => u.id);
    renderAssigneeTags();
  } else {
    title.innerText = 'เพิ่มข้อมูลกิจกรรม/ตัวชี้วัด';
    document.getElementById('activity-id').value = '';
    
    // Default values init
    document.getElementById('act-kpi-type').value = 'percentage';
    document.getElementById('act-target-value').value = '100';
    
    const existingCards = document.querySelectorAll('.activity-card');
    document.getElementById('act-seq').value = existingCards.length + 1;

    selectedAssigneeIds = [];
    renderAssigneeTags();
  }

  openModal('modal-activity');
}

// User Modal
function openUserModal(user = null) {
  const form = document.getElementById('user-form');
  const title = document.getElementById('user-modal-title');
  form.reset();

  if (user) {
    title.innerText = 'แก้ไขข้อมูลผู้ใช้งาน';
    document.getElementById('manage-user-id').value = user.id;
    document.getElementById('user-fullname').value = user.name;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-password').placeholder = 'รหัสผ่านใหม่ (ปล่อยว่างหากไม่ต้องการแก้ไข)';
    document.getElementById('user-password').required = false;
  } else {
    title.innerText = 'เพิ่มผู้ใช้งานในระบบ';
    document.getElementById('manage-user-id').value = '';
    document.getElementById('user-password').placeholder = 'กำหนดรหัสผ่านเข้าใช้งาน';
    document.getElementById('user-password').required = true;
  }

  openModal('modal-user');
}

// ----------------------------------------------------
// TAB SYSTEM NAVIGATION
// ----------------------------------------------------

function switchTab(tabId) {
  activeTab = tabId;
  
  // Update nav tabs styling
  document.querySelectorAll('.tab-link').forEach(link => {
    if (link.dataset.tab === tabId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Update panels display
  document.querySelectorAll('.tab-content-panel').forEach(panel => {
    if (panel.id === `panel-${tabId}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Trigger loads based on active tab
  if (tabId === 'dashboard') {
    loadDashboardStats(selectedPlanId);
  } else if (tabId === 'my-tasks') {
    loadMyTasksList();
  } else if (tabId === 'user-management') {
    renderUserManagementTable();
  } else if (tabId === 'db-admin') {
    loadDbTables();
  }
}

// ----------------------------------------------------
// DYNAMIC DB ADMIN PANEL (phpMyAdmin Lite)
// ----------------------------------------------------

function initDbAdminEvents() {
  const tblSelect = document.getElementById('db-table-select');
  if (tblSelect) {
    tblSelect.addEventListener('change', (e) => {
      loadTableData(e.target.value);
    });
  }

  const addBtn = document.getElementById('db-add-row-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openDbRowModal(null);
    });
  }

  const csvBtn = document.getElementById('db-export-csv-btn');
  if (csvBtn) {
    csvBtn.addEventListener('click', exportTableToCsv);
  }

  // Row form submission
  document.getElementById('db-row-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = {};
    currentDbSchema.forEach(col => {
      const input = document.getElementById(`db-field-${col.name}`);
      if (input && !input.disabled) {
        const val = input.value.trim();
        if (val !== '') {
          formData[col.name] = (input.type === 'number') ? Number(val) : val;
        } else {
          formData[col.name] = null;
        }
      }
    });

    const isEdit = editingDbRowId !== null;
    const url = isEdit ? `/api/db-admin/data/${currentDbTable}/${editingDbRowId}` : `/api/db-admin/data/${currentDbTable}`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        closeModal('modal-db-row');
        loadTableData(currentDbTable);
      } else {
        const err = await res.json();
        alert('บันทึกล้มเหลว: ' + err.error);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  });
}

async function loadDbTables() {
  try {
    const res = await fetch('/api/db-admin/tables');
    const tables = await res.json();
    const select = document.getElementById('db-table-select');
    select.innerHTML = '<option value="">-- เลือกตาราง --</option>';
    tables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.innerText = t;
      select.appendChild(opt);
    });
    // Reset view
    loadTableData('');
  } catch (err) {
    console.error('Failed to load tables list:', err);
  }
}

async function loadTableData(tableName) {
  currentDbTable = tableName;
  const addBtn = document.getElementById('db-add-row-btn');
  const csvBtn = document.getElementById('db-export-csv-btn');
  const head = document.getElementById('db-admin-table-head');
  const body = document.getElementById('db-admin-table-body');

  if (!tableName) {
    addBtn.style.display = 'none';
    csvBtn.style.display = 'none';
    head.innerHTML = '<tr><th style="color: var(--text-muted); font-style: italic;">กรุณาเลือกตารางเพื่อดูข้อมูล</th></tr>';
    body.innerHTML = '<tr><td style="text-align: center; padding: 40px; color: var(--text-muted);">ไม่มีข้อมูลที่จะแสดงผล</td></tr>';
    return;
  }

  try {
    // 1. Load schema columns
    const schemaRes = await fetch(`/api/db-admin/schema/${tableName}`);
    currentDbSchema = await schemaRes.json();
    
    // 2. Load data rows
    const dataRes = await fetch(`/api/db-admin/data/${tableName}`);
    const data = await dataRes.json();
    currentDbRows = data.rows || [];

    // Render Headers
    head.innerHTML = '';
    const tr = document.createElement('tr');
    currentDbSchema.forEach(col => {
      const th = document.createElement('th');
      th.innerText = `${col.name}${col.pk ? ' 🔑' : ''}`;
      tr.appendChild(th);
    });
    const thOps = document.createElement('th');
    thOps.innerText = 'การจัดการ';
    thOps.style.textAlign = 'right';
    tr.appendChild(thOps);
    head.appendChild(tr);

    // Render Rows
    body.innerHTML = '';
    if (currentDbRows.length === 0) {
      body.innerHTML = `<tr><td colspan="${currentDbSchema.length + 1}" style="text-align: center; padding: 40px; color: var(--text-muted);">ตารางนี้ไม่มีข้อมูล</td></tr>`;
    } else {
      currentDbRows.forEach(row => {
        const trRow = document.createElement('tr');
        currentDbSchema.forEach(col => {
          const td = document.createElement('td');
          const val = row[col.name];
          td.innerText = val !== null && val !== undefined ? val : 'NULL';
          td.title = val !== null && val !== undefined ? val : 'NULL';
          trRow.appendChild(td);
        });

        // Operations cell
        const tdOps = document.createElement('td');
        tdOps.style.textAlign = 'right';
        tdOps.innerHTML = `
          <button class="btn btn-secondary db-action-btn edit-row-btn" style="margin-right: 4px;">แก้ไข</button>
          <button class="btn btn-secondary db-action-btn delete-row-btn" style="color: #ef4444; border-color: #fca5a5;">ลบ</button>
        `;

        let rowId = row.id;
        if (tableName === 'kpi_assignees') {
          rowId = `${row.kpi_activity_id}-${row.user_id}`;
        }

        tdOps.querySelector('.edit-row-btn').addEventListener('click', () => openDbRowModal(row));
        tdOps.querySelector('.delete-row-btn').addEventListener('click', () => deleteDbRow(rowId));

        trRow.appendChild(tdOps);
        body.appendChild(trRow);
      });
    }

    addBtn.style.display = 'inline-flex';
    csvBtn.style.display = 'inline-flex';
  } catch (err) {
    console.error('Failed to load table details:', err);
  }
}

function openDbRowModal(row = null) {
  const container = document.getElementById('db-row-fields-container');
  container.innerHTML = '';
  const title = document.getElementById('db-row-modal-title');

  if (row) {
    title.innerText = `แก้ไขข้อมูลแถวตาราง: ${currentDbTable}`;
    editingDbRowId = currentDbTable === 'kpi_assignees' ? `${row.kpi_activity_id}-${row.user_id}` : row.id;
  } else {
    title.innerText = `เพิ่มข้อมูลแถวตาราง: ${currentDbTable}`;
    editingDbRowId = null;
  }

  currentDbSchema.forEach(col => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.innerText = `${col.name} (${col.type})${col.pk ? ' [PRIMARY KEY]' : ''}`;

    let input;
    const isAutoId = col.pk && col.name === 'id';

    if (col.type.toUpperCase() === 'TEXT' || col.type.toUpperCase() === '') {
      input = document.createElement('textarea');
      input.rows = 2;
      input.className = 'form-control';
    } else {
      input = document.createElement('input');
      input.type = col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL') ? 'number' : 'text';
      input.className = 'form-control';
      if (col.type.toUpperCase().includes('REAL')) {
        input.step = 'any';
      }
    }

    input.name = col.name;
    input.id = `db-field-${col.name}`;

    if (row) {
      input.value = row[col.name] !== null && row[col.name] !== undefined ? row[col.name] : '';
      if (col.pk) {
        input.disabled = true; // Lock keys on edit
      }
    } else {
      if (isAutoId) {
        input.disabled = true;
        input.placeholder = '(ระบบจะเจน ID อัตโนมัติ)';
      }
    }

    group.appendChild(label);
    group.appendChild(input);
    container.appendChild(group);
  });

  openModal('modal-db-row');
}

async function deleteDbRow(id) {
  if (confirm('คุณต้องการลบข้อมูลดิบนี้ออกจากฐานข้อมูล SQLite ใช่หรือไม่?\nโปรดใช้ความระมัดระวังเนื่องจากอาจส่งผลกระทบต่อความสัมพันธ์ของข้อมูลส่วนอื่น')) {
    try {
      const res = await fetch(`/api/db-admin/data/${currentDbTable}/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadTableData(currentDbTable);
      } else {
        const err = await res.json();
        alert('เกิดข้อผิดพลาด: ' + err.error);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }
}

function exportTableToCsv() {
  if (currentDbRows.length === 0) {
    alert('ไม่มีข้อมูลในตารางที่จะส่งออก');
    return;
  }
  const headers = currentDbSchema.map(col => col.name);
  let csvContent = "\ufeff"; // BOM UTF-8 for Thai Excel support
  csvContent += headers.join(",") + "\n";

  currentDbRows.forEach(row => {
    const line = headers.map(h => {
      let val = row[h];
      if (val === null || val === undefined) return '';
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    });
    csvContent += line.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${currentDbTable}_data.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ----------------------------------------------------
// EVENT BINDINGS & SUBMISSIONS
// ----------------------------------------------------

function setupGlobalEvents() {
  
  // Tab Navigation Links click
  document.querySelectorAll('.tab-link').forEach(link => {
    link.addEventListener('click', () => {
      switchTab(link.dataset.tab);
    });
  });

  // Plan Selection Dropdown change
  const planSelect = document.getElementById('plan-select');
  planSelect.addEventListener('change', (e) => {
    selectedPlanId = e.target.value;
    const planText = planSelect.options[planSelect.selectedIndex].text;
    document.getElementById('current-plan-title').innerText = planText;
    
    // Toggle Edit/Delete actions in plan select dropdown
    const adminActions = document.getElementById('admin-plan-actions');
    if (adminActions) {
      if (window.currentUser && window.currentUser.role === 'admin') {
        adminActions.style.display = 'block';
        renderPlanAdminActions();
      } else {
        adminActions.style.display = 'none';
      }
    }

    // Reset workspace strategy selection
    selectedStrategyId = null;
    document.getElementById('workspace-empty-state').style.display = 'block';
    document.getElementById('workspace-header-block').style.display = 'none';
    document.getElementById('activities-list-container').innerHTML = '';

    // Reload structures
    loadHierarchyTree(selectedPlanId);
    loadDashboardStats(selectedPlanId);
  });

  // Add Node structure btn
  const addNodeBtn = document.getElementById('add-node-btn');
  if (addNodeBtn) {
    addNodeBtn.addEventListener('click', () => {
      openStructureNodeModal('mission', null);
    });
  }

  const createActivityBtn = document.getElementById('create-activity-btn');
  if (createActivityBtn) {
    createActivityBtn.addEventListener('click', () => openActivityModal(null));
  }

  const addUserBtn = document.getElementById('add-user-btn');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', () => openUserModal(null));
  }

  // Modals close buttons
  document.querySelectorAll('.close-modal-btn, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal || btn.closest('.modal-overlay').id;
      closeModal(modalId);
    });
  });

  // Report Filter and Print controls binding
  const reportFilterPlan = document.getElementById('report-filter-plan');
  if (reportFilterPlan) {
    reportFilterPlan.addEventListener('change', async (e) => {
      const pId = e.target.value;
      await populateReportMissionFilter(pId, 'all');
      await fetchAndRenderReport(pId, 'all');
    });
  }

  const reportFilterMission = document.getElementById('report-filter-mission');
  if (reportFilterMission) {
    reportFilterMission.addEventListener('change', (e) => {
      const pId = document.getElementById('report-filter-plan').value;
      const mId = e.target.value;
      fetchAndRenderReport(pId, mId);
    });
  }

  const printReportBtn = document.getElementById('btn-print-report-modal');
  if (printReportBtn) {
    printReportBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Delete Confirm input code binding
  const confirmInput = document.getElementById('delete-confirm-input');
  if (confirmInput) {
    confirmInput.addEventListener('input', (e) => {
      const entered = e.target.value.trim().toUpperCase();
      document.getElementById('delete-confirm-submit-btn').disabled = (entered !== currentConfirmCode);
    });
  }

  const confirmForm = document.getElementById('delete-confirm-form');
  if (confirmForm) {
    confirmForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const entered = confirmInput.value.trim().toUpperCase();
      if (entered === currentConfirmCode) {
        closeModal('modal-delete-confirm');
        if (deleteConfirmCallback) {
          deleteConfirmCallback();
          deleteConfirmCallback = null;
        }
      }
    });
  }

  // --------------------------------------------------
  // FORM SUBMISSION EVENT HANDLERS
  // --------------------------------------------------

  // 1. Strategic Plan Creation/Edit
  const planForm = document.getElementById('plan-form');
  planForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const planId = document.getElementById('plan-id').value;
    const name = document.getElementById('plan-name-input').value.trim();
    const start_year = parseInt(document.getElementById('plan-start-year').value);
    const end_year = parseInt(document.getElementById('plan-end-year').value);

    const isEdit = planId !== '';
    const url = isEdit ? `/api/plans/${planId}` : '/api/plans';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, start_year, end_year })
      });

      if (res.ok) {
        closeModal('modal-plan');
        await loadPlans();
      } else {
        const err = await res.json();
        alert('บันทึกแผนล้มเหลว: ' + err.error);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  });

  // 2. Add/Edit Node (Mission / Strategy dropdown logic)
  const nodeForm = document.getElementById('node-form');
  nodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nodeId = document.getElementById('node-id').value;
    const type = document.getElementById('node-type-select').value;
    const seq = parseInt(document.getElementById('node-seq-input').value);
    const name = document.getElementById('node-name-input').value.trim();

    const isEdit = nodeId !== '';
    let url = '';
    let method = isEdit ? 'PUT' : 'POST';
    let bodyData = { seq, name };

    if (type === 'mission') {
      url = isEdit ? `/api/missions/${nodeId}` : '/api/missions';
      if (!isEdit) {
        bodyData.strategic_plan_id = selectedPlanId;
      }
    } else if (type === 'strategy') {
      url = isEdit ? `/api/strategies/${nodeId}` : '/api/strategies';
      bodyData.action_plan_name = document.getElementById('node-action-plan-input').value.trim();
      bodyData.objective_name = document.getElementById('node-objectives-input').value.trim();
      bodyData.manager_id = document.getElementById('node-manager-select').value || null;
      if (!isEdit) {
        bodyData.mission_id = parseInt(document.getElementById('node-parent-select').value);
      }
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        closeModal('modal-node');
        loadHierarchyTree(selectedPlanId);
        loadDashboardStats(selectedPlanId);
      } else {
        const err = await res.json();
        alert('เกิดข้อผิดพลาด: ' + err.error);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  });

  // 3. Create / Edit Activity (Admin/Manager only)
  const activityForm = document.getElementById('activity-form');
  activityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const activityId = document.getElementById('activity-id').value;
    const kpi_name = document.getElementById('act-kpi-name').value.trim();
    const kpi_type = document.getElementById('act-kpi-type').value;
    const target_value = document.getElementById('act-target-value').value.trim();
    const seq = parseInt(document.getElementById('act-seq').value);
    const activity = document.getElementById('act-activity').value.trim();
    const start_date = document.getElementById('act-start-date').value;
    const end_date = document.getElementById('act-end-date').value;
    const budget_allocated = parseFloat(document.getElementById('act-budget-allocated').value) || 0;

    const isEdit = activityId !== '';
    const endpoint = isEdit ? `/api/activities/${activityId}` : '/api/activities';
    const method = isEdit ? 'PUT' : 'POST';

    const bodyData = {
      kpi_name, kpi_type, target_value, seq, activity,
      start_date, end_date, budget_allocated, assignees: selectedAssigneeIds
    };
    if (!isEdit) {
      bodyData.strategy_id = selectedStrategyId;
    }

    try {
      const res = await fetch(endpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        closeModal('modal-activity');
        loadStrategyActivities(selectedStrategyId);
        loadDashboardStats(selectedPlanId);
      } else {
        const err = await res.json();
        alert('เกิดข้อผิดพลาด: ' + err.error);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกกิจกรรม');
    }
  });

  // 4. User Form (Admin Only)
  const userForm = document.getElementById('user-form');
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('manage-user-id').value;
    const name = document.getElementById('user-fullname').value.trim();
    const username = document.getElementById('user-username').value.trim().toLowerCase();
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;

    const isEdit = userId !== '';
    const endpoint = isEdit ? `/api/users/${userId}` : '/api/users';
    const method = isEdit ? 'PUT' : 'POST';

    const bodyData = { name, username, role };
    if (password && password.trim() !== '') {
      bodyData.password = password;
    }

    try {
      const res = await fetch(endpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      if (res.ok) {
        closeModal('modal-user');
        await loadUsersList();
      } else {
        const err = await res.json();
        alert('เกิดข้อผิดพลาด: ' + err.error);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกผู้ใช้');
    }
  });
}

// ----------------------------------------------------
// PDF REPORT GENERATION & PREVIEW (A4 LANDSCAPE)
// ----------------------------------------------------

window.openReportModal = async function(planId, missionId = 'all') {
  const modal = document.getElementById('modal-report-preview');
  if (!modal) return;

  const targetPlanId = planId || selectedPlanId || 1;
  modal.classList.add('open');

  // Populate plan selector in report toolbar
  const planSelect = document.getElementById('report-filter-plan');
  if (planSelect) {
    try {
      const res = await fetch('/api/plans');
      const plans = await res.json();
      planSelect.innerHTML = '';
      plans.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.name;
        if (p.id == targetPlanId) opt.selected = true;
        planSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('Failed to load plans for report:', err);
    }
  }

  // Populate mission selector
  await populateReportMissionFilter(targetPlanId, missionId);

  // Fetch and display report
  await fetchAndRenderReport(targetPlanId, missionId);
};

async function populateReportMissionFilter(planId, selectedMissionId = 'all') {
  const missionSelect = document.getElementById('report-filter-mission');
  if (!missionSelect) return;
  missionSelect.innerHTML = '<option value="all">ทั้งหมด (ทุกพันธกิจ - ทั้งเล่ม)</option>';

  try {
    const res = await fetch(`/api/plans/${planId}/hierarchy`);
    const missions = await res.json();
    missions.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.innerText = `พันธกิจที่ ${m.seq}: ${m.name}`;
      if (m.id == selectedMissionId) opt.selected = true;
      missionSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load missions for report filter:', err);
  }
}

async function fetchAndRenderReport(planId, missionId = 'all') {
  const container = document.getElementById('report-content-target');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 60px 0; color: #64748b; font-family: Sarabun, sans-serif;">
      <div style="font-size: 16px; font-weight: 600;">กำลังรวบรวมข้อมูลและจัดทำรายงาน...</div>
      <div style="font-size: 13px; margin-top: 6px;">กรุณารอสักครู่</div>
    </div>
  `;

  try {
    const url = `/api/reports/strategic-plan/${planId}?missionId=${missionId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch report data');
    }
    const data = await res.json();
    renderReportHTML(data, missionId);
  } catch (err) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 0; color: #ef4444; font-family: Sarabun, sans-serif;">
        <div style="font-size: 16px; font-weight: 700;">เกิดข้อผิดพลาดในการโหลดข้อมูลรายงาน</div>
        <div style="font-size: 13px; margin-top: 6px;">${err.message}</div>
      </div>
    `;
  }
}

function renderReportHTML(data, filteredMissionId) {
  const container = document.getElementById('report-content-target');
  if (!container) return;

  const plan = data.plan;
  const missions = data.missions || [];

  // Format Title:
  // "ตารางติดตามผลการดำเนินงานตามแผนกลยุทธ์สหกรณ์ออมทรัพย์กองบัญชาการกองทัพไทย จำกัด ( ฉบับที่ 3 ) พ.ศ. 2568 – 2570"
  let editionText = '';
  const match = plan.name.match(/ฉบับที่\s*\d+/);
  if (match) {
    editionText = `( ${match[0]} )`;
  } else {
    editionText = `( ${plan.name} )`;
  }
  const reportMainTitle = `ตารางติดตามผลการดำเนินงานตามแผนกลยุทธ์สหกรณ์ออมทรัพย์กองบัญชาการกองทัพไทย จำกัด ${editionText} พ.ศ. ${plan.start_year} – ${plan.end_year}`;

  // Date formatting in Thai
  const genDate = new Date(data.generated_at);
  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const formattedDate = `${genDate.getDate()} ${thaiMonths[genDate.getMonth()]} พ.ศ. ${genDate.getFullYear() + 543}`;

  // Helper for status text and badge class
  const getStatusInfo = (status) => {
    switch (status) {
      case 'completed': return { text: 'เสร็จสมบูรณ์', cls: 'report-status-completed' };
      case 'in_progress': return { text: 'กำลังดำเนินการ', cls: 'report-status-in_progress' };
      case 'delayed': return { text: 'ล่าช้า', cls: 'report-status-delayed' };
      case 'pending': default: return { text: 'รอดำเนินการ', cls: 'report-status-pending' };
    }
  };

  let html = `
    <div class="report-paper">
      <table class="report-wrapper-table">
        <thead>
          <tr>
            <th class="report-wrapper-th">
              <!-- Report Header (Repeats on every page in Print / PDF) -->
              <div class="report-doc-header">
                <div class="report-coop-name">สหกรณ์ออมทรัพย์กองบัญชาการกองทัพไทย จำกัด</div>
                <div class="report-main-title">${reportMainTitle}</div>
                <div class="report-meta-bar">
                  <span>ข้อมูล ณ วันที่: <strong>${formattedDate}</strong></span>
                  <span>ขอบเขต: <strong>${filteredMissionId && filteredMissionId !== 'all' ? `เฉพาะพันธกิจที่เลือก (${missions.length} พันธกิจ)` : 'ภาพรวมทั้งเล่ม (ทุกพันธกิจ)'}</strong></span>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
  `;

  if (missions.length === 0) {
    html += `
          <tr>
            <td class="report-wrapper-td">
              <div style="text-align: center; padding: 40px; color: #64748b; font-size: 14px;">
                ไม่มีข้อมูลพันธกิจในแผนงานที่เลือก
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;
    container.innerHTML = html;
    return;
  }

  // Iterate over each Mission (Each mission is placed in its own row for page breaks)
  missions.forEach(mission => {
    html += `
          <tr class="report-mission-row" data-mission-seq="${mission.seq}">
            <td class="report-wrapper-td">
              <div class="report-mission-block">
                <div class="report-mission-header">
                  <h4 class="report-mission-title">พันธกิจที่ ${mission.seq} : ${mission.name}</h4>
                </div>
    `;

    if (!mission.strategies || mission.strategies.length === 0) {
      html += `
                <div style="padding: 10px 14px; color: #94a3b8; font-size: 12px; font-style: italic;">
                  (ยังไม่มีกลยุทธ์ในพันธกิจนี้)
                </div>
      `;
    } else {
      // Iterate over each Strategy under this mission (Strategies follow directly without page breaks)
      mission.strategies.forEach(strategy => {
        // Format objectives (support multiline)
        const objectivesHtml = (strategy.objective_name || 'ไม่ระบุ')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => `<div>${line}</div>`)
          .join('');

        html += `
                <div class="report-strategy-block">
                  <div class="report-strategy-info">
                    <div class="report-strategy-title">กลยุทธ์ที่ ${strategy.seq} : ${strategy.name}</div>
                    <div class="report-action-plan-title"><strong>แผนงาน :</strong> ${strategy.action_plan_name || 'ไม่ระบุ'}</div>
                    <div style="font-size: 12px; color: #334155; margin-top: 3px;">
                      <strong>วัตถุประสงค์ :</strong>
                      <div class="report-objective-list">${objectivesHtml}</div>
                    </div>
                  </div>

                  <!-- Table 5 Columns -->
                  <table class="report-table">
                    <thead>
                      <tr>
                        <th class="report-col-seq">ลำดับ</th>
                        <th class="report-col-kpi">ตัวชี้วัด</th>
                        <th class="report-col-activity">กิจกรรม</th>
                        <th class="report-col-result">ผลการดำเนินการ</th>
                        <th class="report-col-responsible">ผู้รับผิดชอบ</th>
                      </tr>
                    </thead>
                    <tbody>
        `;

        if (!strategy.activities || strategy.activities.length === 0) {
          html += `
                      <tr>
                        <td colspan="5" style="text-align: center; color: #94a3b8; padding: 16px; font-style: italic;">
                          ยังไม่มีข้อมูลกิจกรรม / ตัวชี้วัด ในกลยุทธ์นี้
                        </td>
                      </tr>
          `;
        } else {
          strategy.activities.forEach((act, idx) => {
            const stInfo = getStatusInfo(act.progress_status);

            // Responsible person: assignees -> fallback to strategy manager -> fallback to '-'
            let responsibleText = '-';
            if (act.assignees && act.assignees.length > 0) {
              responsibleText = act.assignees.map(u => u.name).join('<br>');
            } else if (strategy.manager_name) {
              responsibleText = strategy.manager_name;
            }

            // Steps HTML
            let stepsHtml = '';
            if (act.steps && act.steps.length > 0) {
              stepsHtml = `
                <div class="report-steps-box">
                  ${act.steps.map(step => `
                    <div class="report-step-item">
                      <div class="report-step-header">• ${step.step_name} (${step.progress_percent}%)</div>
                      ${step.actual_result ? `<div class="report-step-result">- ${step.actual_result}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              `;
            }

            // Actual value if present
            let actualValHtml = '';
            if (act.actual_value && act.actual_value.trim() !== '') {
              actualValHtml = `<div style="font-size: 11.5px; color: #0f172a; margin-top: 3px;"><strong>ผลงานจริง:</strong> ${act.actual_value}</div>`;
            }

            // Target formatting
            let targetHtml = '';
            if (act.target_value && act.target_value.trim() !== '') {
              targetHtml = `<div class="report-kpi-target">(เป้าหมาย: ${act.target_value}${act.kpi_type === 'percentage' ? '%' : ''})</div>`;
            }

            html += `
                      <tr>
                        <td class="report-col-seq">${idx + 1}</td>
                        <td class="report-col-kpi">
                          <strong>${act.kpi_name}</strong>
                          ${targetHtml}
                        </td>
                        <td class="report-col-activity">${act.activity}</td>
                        <td class="report-col-result">
                          <span class="report-progress-status-box ${stInfo.cls}">
                            ความก้าวหน้า ${act.progress_percent}% (${stInfo.text})
                          </span>
                          ${actualValHtml}
                          ${stepsHtml}
                        </td>
                        <td class="report-col-responsible">${responsibleText}</td>
                      </tr>
            `;
          });
        }

        html += `
                    </tbody>
                  </table>
                </div>
        `;
      });
    }

    html += `
              </div>
            </td>
          </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;
  container.innerHTML = html;
}
