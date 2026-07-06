(function () {
  var fallbackStatus = {
    monthLabel: '2026년 7월 현재',
    totalLabel: '25명 접수',
    summaryNote: '월 통합 접수 현황입니다.',
    notice: '상담 가능 여부는 한베커플과의 상담 가능 상태를 의미하며, 실제 혼인 진행 가능 여부는 상담 후 개별 확인합니다.',
    weeks: [
      { label: '7월 1주', count: '11', unit: '명 접수', status: '상담 가능' },
      { label: '7월 2주', count: '14', unit: '명 접수', status: '상담 가능' }
    ]
  };

  function setText(id, value) {
    var element = document.getElementById(id);
    if (element && value) {
      element.textContent = value;
    }
  }

  function createStatusCard(item) {
    var article = document.createElement('article');
    article.className = 'status-card';

    var label = document.createElement('p');
    label.textContent = item.label || '';

    var count = document.createElement('strong');
    count.textContent = item.count || '';

    var unit = document.createElement('span');
    unit.textContent = item.unit || '명 접수';

    var status = document.createElement('small');
    status.textContent = item.status || '상담 가능';

    article.appendChild(label);
    article.appendChild(count);
    article.appendChild(unit);
    article.appendChild(status);

    return article;
  }

  function renderStatus(data) {
    setText('statusMonth', data.monthLabel);
    setText('statusTotal', data.totalLabel);
    setText('statusSummaryNote', data.summaryNote);

    var notice = document.getElementById('statusNotice');
    if (notice && data.notice) {
      notice.textContent = '';
      var title = document.createElement('b');
      title.textContent = '안내';
      notice.appendChild(title);
      notice.appendChild(document.createTextNode(' ' + data.notice));
    }

    var list = document.getElementById('weeklyStatusList');
    if (!list || !Array.isArray(data.weeks)) {
      return;
    }

    list.innerHTML = '';
    data.weeks.forEach(function (item) {
      list.appendChild(createStatusCard(item));
    });
  }

  fetch('data/recent-status.json', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) {
        throw new Error('recent status data not found');
      }
      return response.json();
    })
    .then(renderStatus)
    .catch(function () {
      renderStatus(fallbackStatus);
    });
}());
