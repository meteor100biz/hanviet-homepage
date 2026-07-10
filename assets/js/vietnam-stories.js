(function () {
  function text(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function createStoryCard(item) {
    var article = document.createElement('article');
    var wrapper = article;
    var link = text(item.link).trim();

    if (link) {
      wrapper = document.createElement('a');
      wrapper.href = link;
      wrapper.className = 'gallery-link';
      if (/^https?:\/\//i.test(link)) {
        wrapper.target = '_blank';
        wrapper.rel = 'noopener noreferrer';
      }
      article.appendChild(wrapper);
    }

    var image = document.createElement('img');
    image.src = text(item.image);
    image.alt = text(item.alt || item.title);

    var title = document.createElement('h3');
    title.textContent = text(item.title);

    var description = document.createElement('p');
    description.textContent = text(item.description);

    wrapper.appendChild(image);
    wrapper.appendChild(title);
    wrapper.appendChild(description);

    return article;
  }

  function renderStories(data) {
    var grid = document.getElementById('vietnamStoriesGrid');
    if (!grid || !data || !Array.isArray(data.items)) {
      return;
    }

    grid.innerHTML = '';
    data.items.slice(0, 6).forEach(function (item) {
      grid.appendChild(createStoryCard(item));
    });
  }

  fetch('data/vietnam-stories.json', { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) {
        throw new Error('vietnam stories data not found');
      }
      return response.json();
    })
    .then(renderStories)
    .catch(function () {
      return;
    });
}());
