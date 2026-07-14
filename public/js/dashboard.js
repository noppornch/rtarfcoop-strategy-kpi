// Dashboard Chart and Data Visualizations
let statusChart = null;

async function loadDashboardStats(planId) {
  try {
    const res = await fetch(`/api/dashboard/stats?planId=${planId}`);
    const data = await res.json();

    // 1. Update Numeric Count stats
    document.getElementById('stat-missions').innerText = data.counts.total_missions || 0;
    document.getElementById('stat-strategies').innerText = data.counts.total_strategies || 0;
    document.getElementById('stat-activities').innerText = data.total_activities || 0;
    document.getElementById('stat-overall-progress').innerText = `${data.avg_progress || 0}%`;

    // 2. Update KPI Completion Rate text
    document.getElementById('success-rate-val').innerText = `${data.completed_activities || 0}/${data.total_activities || 0}`;

    // 3. Update Project Health Counts
    document.getElementById('health-ontrack-count').innerText = `${data.health.on_track || 0} กิจกรรม`;
    document.getElementById('health-atrisk-count').innerText = `${data.health.at_risk || 0} กิจกรรม`;
    document.getElementById('health-offtrack-count').innerText = `${data.health.off_track || 0} กิจกรรม`;

    // 4. Update Budget Metrics
    const budgetAllocated = data.budget.allocated || 0;
    const budgetSpent = data.budget.spent || 0;
    
    // Formatting currency
    const formatCurrency = (val) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(val);
    document.getElementById('budget-allocated-total').innerText = formatCurrency(budgetAllocated);
    document.getElementById('budget-spent-total').innerText = formatCurrency(budgetSpent);

    const budgetPercent = budgetAllocated > 0 ? Math.round((budgetSpent / budgetAllocated) * 100) : 0;
    document.getElementById('budget-progress-fill').style.width = `${Math.min(budgetPercent, 100)}%`;
    document.getElementById('budget-ratio-text').innerText = `ใช้ไป ${budgetPercent}% ของงบประมาณโครงการ`;

    // 5. Update Mission Progress List (Render styled progress list dynamically)
    const missionListContainer = document.getElementById('mission-progress-list');
    missionListContainer.innerHTML = '';
    
    if (data.missions_progress && data.missions_progress.length > 0) {
      data.missions_progress.forEach(m => {
        const item = document.createElement('div');
        item.className = 'mission-progress-item';
        item.innerHTML = `
          <div class="mission-progress-header">
            <span class="mission-progress-name" title="${m.name}">พันธกิจที่ ${m.seq}: ${m.name}</span>
            <span class="mission-progress-value">${m.avg_progress || 0}%</span>
          </div>
          <div class="progress-container">
            <div class="progress-fill" style="width: ${m.avg_progress || 0}%;"></div>
          </div>
          <span style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">(จำนวน ${m.total_activities || 0} กิจกรรมติดตาม)</span>
        `;
        missionListContainer.appendChild(item);
      });
    } else {
      missionListContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px 0;">ยังไม่มีกิจกรรมบันทึก</div>';
    }

    // 6. Draw Chart.js Doughnut Chart
    renderChart(data.status);

  } catch (err) {
    console.error('Failed to load dashboard stats:', err);
  }
}

function renderChart(statusData) {
  const ctx = document.getElementById('statusChart').getContext('2d');

  const pending = statusData.pending || 0;
  const inProgress = statusData.in_progress || 0;
  const completed = statusData.completed || 0;
  const delayed = statusData.delayed || 0;

  // Clear existing chart instance if exists
  if (statusChart) {
    statusChart.destroy();
  }

  // Check if there is data to display
  const total = pending + inProgress + completed + delayed;
  if (total === 0) {
    ctx.clearRect(0, 0, 300, 300);
    // Draw text inside canvas
    ctx.font = '14px Outfit, Sarabun, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('ยังไม่มีข้อมูลกิจกรรมสำหรับวาดกราฟ', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }

  statusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['รอดำเนินการ (Pending)', 'กำลังดำเนินการ (In Progress)', 'เสร็จสมบูรณ์ (Completed)', 'ล่าช้า (Delayed)'],
      datasets: [{
        data: [pending, inProgress, completed, delayed],
        backgroundColor: [
          '#64748b', // Slate
          '#f59e0b', // Amber
          '#22c55e', // Green
          '#ef4444'  // Red
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 12,
            font: {
              family: 'Outfit, Sarabun, sans-serif',
              size: 12
            },
            color: '#64748b'
          }
        },
        tooltip: {
          titleFont: {
            family: 'Outfit, Sarabun, sans-serif'
          },
          bodyFont: {
            family: 'Outfit, Sarabun, sans-serif'
          }
        }
      },
      cutout: '65%'
    }
  });
}
