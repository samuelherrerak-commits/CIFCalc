const Nav = {
  render(active = '') {
    const links = [
      { path: '#/', key: 'dashboard', label: 'Dashboard', icon: '📊' }
    ];

    const nav = document.getElementById('navbar');
    nav.innerHTML = `
      <nav class="bg-slate-900 text-white shadow-md">
        <div class="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          <a href="#/" class="flex items-center gap-2 font-bold text-lg">
            <span class="text-2xl">🚚</span>
            <span class="hidden sm:inline">CIFCalc</span>
          </a>
          <ul class="flex gap-1">
            ${links.map(l => `
              <li>
                <a href="${l.path}"
                   class="px-3 py-2 rounded-lg text-sm font-semibold transition
                          ${active === l.key ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}">
                  <span class="sm:hidden">${l.icon}</span>
                  <span class="hidden sm:inline">${l.label}</span>
                </a>
              </li>
            `).join('')}
          </ul>
        </div>
      </nav>
    `;
  }
};

export default Nav;
