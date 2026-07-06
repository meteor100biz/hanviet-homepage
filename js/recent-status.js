(function () {
  function setText(id, value) {
    var element = document.getElementById(id);
    if (element && value !== undefined && value !== null) {
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

  function getCountNumber(item) {
    var rawCount = item && item.count !== undefined && item.count !== null ? String(item.count) : '0';
    var count = parseInt(rawCount.replace(/,/g, ''), 10);
    return Number.isNaN(count) ? 0 : count;
  }

  function getTotalLabel(data) {
    if (Array.isArray(data.weeks) && data.weeks.length > 0) {
      var total = data.weeks.reduce(function (sum, item) {
        return sum + getCountNumber(item);
      }, 0);
      return total.toLocaleString('ko-KR') + '명 접수';
    }

    return data.totalLabel || '-';
  }

  function renderStatus(data) {
    if (!data) {
      return;
    }

    setText('statusMonth', data.monthLabel);
    setText('statusTotal', getTotalLabel(data));
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
      setText('statusMonth', '접수 현황 확인 중');
      setText('statusTotal', '-');
      setText('statusSummaryNote', '자료 파일을 확인해 주세요.');

      var notice = document.getElementById('statusNotice');
      if (notice) {
        notice.textContent = '';
        var title = document.createElement('b');
        title.textContent = '안내';
        notice.appendChild(title);
        notice.appendChild(document.createTextNode(' 접수 현황 파일을 불러오지 못했습니다. data/recent-status.json 경로를 확인해 주세요.'));
      }
    });
}());
