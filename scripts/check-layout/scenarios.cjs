const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCENARIOS = [
  {
    id: 'firewalls',
    name: 'Firewalls tab',
    tab: 'Firewalls',
    ready: 'table tbody tr',
  },
  {
    id: 'account-menu',
    name: 'Account menu and zoom controls',
    ready: 'table tbody tr',
    action: 'account-menu',
  },
  {
    id: 'policies',
    name: 'Policies tab',
    tab: 'Policies',
    ready: 'table tbody tr',
  },
  {
    id: 'rules',
    name: 'Rules tab',
    tab: 'Rules',
    ready: 'table tbody tr',
  },
  {
    id: 'ip-groups',
    name: 'IP groups tab',
    tab: 'IP groups',
    ready: 'table tbody tr',
  },
  {
    id: 'flow-tester',
    name: 'Flow tester tab',
    tab: 'Flow tester',
    ready: 'input, select',
  },
  {
    id: 'logs',
    name: 'Firewall logs tab',
    tab: 'Firewall logs',
    ready: '[role="grid"][aria-label="Firewall log rows"] [data-row-id]',
  },
  {
    id: 'blade-overlay',
    name: 'Main navigation overlay',
    ready: 'table tbody tr',
    action: 'blade-overlay',
    maxCssWidth: 719,
  },
  {
    id: 'rules-sidebar-overlay',
    name: 'Rules sidebar overlay',
    tab: 'Rules',
    ready: 'table tbody tr',
    action: 'rules-sidebar-overlay',
    maxCssWidth: 719,
  },
  {
    id: 'logs-details',
    name: 'Firewall logs with details',
    tab: 'Firewall logs',
    ready: '[role="grid"][aria-label="Firewall log rows"] [data-row-id]',
    action: 'log-details',
  },
  {
    id: 'snapshots',
    name: 'Snapshots tab',
    tab: 'Snapshots',
    ready: 'h1',
    readyText: 'Firewall snapshots',
  },
  {
    id: 'history',
    name: 'Commit history tab',
    tab: 'Commit history',
    ready: 'table tbody tr',
  },
  {
    id: 'firewall-picker',
    name: 'Firewall picker',
    mode: 'picker',
    ready: 'h1',
    readyText: 'Choose which firewalls to show',
  },
  {
    id: 'sign-in',
    name: 'Sign-in',
    mode: 'signin',
    ready: 'h1',
    readyText: 'Sign in to Azure',
  },
  {
    id: 'directory',
    name: 'Directory chooser',
    mode: 'directory',
    ready: 'h1',
    readyText: 'Choose a directory',
  },
  {
    id: 'collection-modal',
    name: 'New rule collection modal',
    tab: 'Rules',
    ready: 'table tbody tr',
    action: 'collection-modal',
  },
  {
    id: 'commit-modal',
    name: 'Commit review modal',
    action: 'commit-modal',
    ready: '[aria-label="Uncommitted changes"]',
  },
  {
    id: 'deploy-wizard',
    name: 'Deploy wizard',
    action: 'deploy-wizard',
    ready: 'table tbody tr',
  },
  {
    id: 'log-setup-wizard',
    name: 'Log setup wizard',
    mode: 'log-form',
    tab: 'Firewall logs',
    ready: 'section[aria-label="Detected from your firewalls"]',
    action: 'log-setup-wizard',
  },
];

async function waitForPage(webContents, description, source, timeout = 15_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      if (await webContents.executeJavaScript(`Boolean(${source})`)) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`,
  );
}

async function settle(webContents) {
  await webContents.executeJavaScript(`(async () => {
    await globalThis.document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()`);
}

async function clickTab(webContents, label) {
  await waitForPage(
    webContents,
    `navigation item ${label}`,
    `[...globalThis.document.querySelectorAll('button[aria-label]')].some((el) => el.getAttribute('aria-label') === ${JSON.stringify(label)})`,
  );
  await webContents.executeJavaScript(`(() => {
    const button = [...globalThis.document.querySelectorAll('button[aria-label]')]
      .find((el) => el.getAttribute('aria-label') === ${JSON.stringify(label)});
    button.click();
    return true;
  })()`);
}

async function clickButton(webContents, prefix) {
  await waitForPage(
    webContents,
    `button ${prefix}`,
    `[...globalThis.document.querySelectorAll('button')].some((el) => el.textContent.trim().startsWith(${JSON.stringify(prefix)}) && el.getClientRects().length)`,
  );
  await webContents.executeJavaScript(`(() => {
    const button = [...globalThis.document.querySelectorAll('button')]
      .find((el) => el.textContent.trim().startsWith(${JSON.stringify(prefix)}) && el.getClientRects().length);
    button.click();
    return true;
  })()`);
}

async function readyScenario(webContents, scenario) {
  const selector = scenario.ready.replaceAll("'", "\\'");
  await waitForPage(
    webContents,
    `${scenario.name} renderer`,
    `(() => {
      const candidates = [...globalThis.document.querySelectorAll('${selector}')];
      const match = candidates.some((el) => !${JSON.stringify(scenario.readyText ?? '')} || el.textContent.includes(${JSON.stringify(scenario.readyText ?? '')}));
      return match && globalThis.document.body && globalThis.document.body.children.length > 0;
    })()`,
  );
}

async function applyAction(webContents, action) {
  if (action === 'blade-overlay') {
    await waitForPage(
      webContents,
      'expand navigation button',
      `[...globalThis.document.querySelectorAll('button[aria-label]')].some((element) => element.getAttribute('aria-label') === 'Expand navigation')`,
    );
    await webContents.executeJavaScript(`(() => {
      [...globalThis.document.querySelectorAll('button[aria-label]')]
        .find((element) => element.getAttribute('aria-label') === 'Expand navigation')
        .click();
      return true;
    })()`);
    await waitForPage(
      webContents,
      'main navigation overlay',
      `(() => {
        const nav = globalThis.document.querySelector('nav[aria-label="Main"]');
        return nav && nav.classList.contains('absolute') && nav.getBoundingClientRect().width > 100 && globalThis.document.activeElement === nav;
      })()`,
    );
    await webContents.executeJavaScript(`(() => {
      globalThis.document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()`);
    await waitForPage(
      webContents,
      'navigation focus return',
      `globalThis.document.activeElement?.getAttribute('aria-label') === 'Expand navigation'`,
    );
    await webContents.executeJavaScript(`(() => {
      globalThis.document.activeElement.click();
      return true;
    })()`);
    await waitForPage(
      webContents,
      'reopened main navigation overlay',
      `globalThis.document.querySelector('nav[aria-label="Main"]')?.classList.contains('absolute')`,
    );
  } else if (action === 'rules-sidebar-overlay') {
    await waitForPage(
      webContents,
      'show rules sidebar button',
      `[...globalThis.document.querySelectorAll('button[aria-label]')].some((element) => element.getAttribute('aria-label') === 'Show policy and rule collection groups')`,
    );
    await webContents.executeJavaScript(`(() => {
      [...globalThis.document.querySelectorAll('button[aria-label]')]
        .find((element) => element.getAttribute('aria-label') === 'Show policy and rule collection groups')
        .click();
      return true;
    })()`);
    await waitForPage(
      webContents,
      'rules sidebar overlay',
      `(() => {
        const panel = globalThis.document.querySelector('aside[aria-label="Policy and rule collection groups"]');
        return panel && panel.classList.contains('absolute') && panel.getBoundingClientRect().width > 100 && globalThis.document.activeElement === panel;
      })()`,
    );
    await webContents.executeJavaScript(`(() => {
      globalThis.document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()`);
    await waitForPage(
      webContents,
      'rules sidebar focus return',
      `globalThis.document.activeElement?.getAttribute('aria-label') === 'Show policy and rule collection groups'`,
    );
    await webContents.executeJavaScript(`(() => {
      globalThis.document.activeElement.click();
      return true;
    })()`);
    await waitForPage(
      webContents,
      'reopened rules sidebar overlay',
      `globalThis.document.querySelector('aside[aria-label="Policy and rule collection groups"]')?.classList.contains('absolute')`,
    );
  } else if (action === 'account-menu') {
    await webContents.executeJavaScript(`(() => {
      globalThis.document.querySelector('button[aria-label="Account"]').click();
      return true;
    })()`);
    await waitForPage(
      webContents,
      'Account popup',
      `globalThis.document.querySelector('[role="menu"] [aria-label="Zoom controls"]')`,
    );
  } else if (action === 'log-details') {
    await webContents.executeJavaScript(`(() => {
      globalThis.document.querySelector('[data-row-id]').click();
      return true;
    })()`);
    await waitForPage(
      webContents,
      'log details panel',
      `globalThis.document.querySelector('aside[aria-label="Log row details"]')`,
    );
    const overlay = await webContents.executeJavaScript(`
      globalThis.document.querySelector('aside[aria-label="Log row details"]')?.getAttribute('role') === 'dialog'
    `);
    if (overlay) {
      await waitForPage(
        webContents,
        'log details focus',
        `globalThis.document.activeElement?.matches('aside[aria-label="Log row details"]')`,
      );
      await webContents.executeJavaScript(`(() => {
        globalThis.document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return true;
      })()`);
      await waitForPage(
        webContents,
        'log row focus return',
        `globalThis.document.activeElement?.hasAttribute('data-row-id')`,
      );
      await webContents.executeJavaScript(`(() => {
        globalThis.document.activeElement.click();
        return true;
      })()`);
      await waitForPage(
        webContents,
        'reopened log details focus',
        `globalThis.document.activeElement?.matches('aside[aria-label="Log row details"]')`,
      );
    }
  } else if (action === 'collection-modal') {
    await clickButton(webContents, 'Add rule collection');
    await waitForPage(
      webContents,
      'new rule collection dialog',
      `[...globalThis.document.querySelectorAll('[role="dialog"] h2')].some((el) => el.textContent.includes('New rule collection'))`,
    );
  } else if (action === 'commit-modal') {
    await clickButton(webContents, 'Review and commit');
    await waitForPage(
      webContents,
      'commit review dialog',
      `[...globalThis.document.querySelectorAll('[role="dialog"] h2')].some((el) => el.textContent.includes('Commit to Azure'))`,
    );
  } else if (action === 'deploy-wizard') {
    await clickButton(webContents, 'Deploy firewall');
    await waitForPage(
      webContents,
      'deploy wizard',
      `globalThis.document.querySelector('[role="dialog"]')`,
    );
  } else if (action === 'log-setup-wizard') {
    await clickButton(webContents, 'Set up logging');
    await waitForPage(
      webContents,
      'log setup wizard',
      `[...globalThis.document.querySelectorAll('[role="dialog"] h2')].some((el) => el.textContent.includes('Set up firewall logging'))`,
    );
  }
  await settle(webContents);
}

async function prepareScenario(webContents, rendererDir, scenario, viewport) {
  const mode = scenario.mode ?? 'workspace';
  const url = pathToFileURL(path.join(rendererDir, 'index.html'));
  url.searchParams.set('layoutScenario', mode);
  url.searchParams.set('layoutView', scenario.id);
  await webContents.loadURL(url.toString());
  webContents.setZoomFactor(viewport.zoom / 100);
  await settle(webContents);
  await waitForPage(
    webContents,
    'initial renderer boot',
    `globalThis.document.querySelector('#root')?.textContent.trim().length`,
  );
  if (scenario.tab) await clickTab(webContents, scenario.tab);
  await readyScenario(webContents, scenario);
  if (scenario.action) await applyAction(webContents, scenario.action);
  await settle(webContents);
}

// Exercise the real portal at each matrix row, including zoom changes while it stays open.
async function assertAccountMenu(webContents) {
  await settle(webContents);
  const error = await webContents.executeJavaScript(`(() => {
    try {
    const menu = globalThis.document.querySelector('[role="menu"]');
    const trigger = globalThis.document.querySelector('button[aria-label="Account"]');
    if (!menu || !trigger) throw new Error('Account popup is missing');
    const rect = menu.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    if (anchor.top < 0 || anchor.bottom > innerHeight)
      throw new Error('Account trigger is outside the viewport: ' + JSON.stringify({top:anchor.top,bottom:anchor.bottom,height:innerHeight}));
    if (rect.top < 7 || rect.bottom > innerHeight - 7 || rect.left < 7 || rect.right > innerWidth - 7)
      throw new Error('Account popup is outside the viewport: ' + JSON.stringify({top:rect.top,bottom:rect.bottom,height:innerHeight}));
    const controls = [
      menu.querySelector('button[aria-label="Zoom out"]'),
      menu.querySelector('button[aria-label="Zoom in"]'),
      [...menu.querySelectorAll('button')].find(button => button.textContent.trim() === 'Reset'),
      [...menu.querySelectorAll('[role="menuitem"]')].find(button => button.textContent.trim() === 'Sign out'),
    ];
    for (const button of controls) {
      if (!button) throw new Error('Account control is missing');
      button.scrollIntoView({block:'nearest'});
      const bounds = button.getBoundingClientRect();
      const hit = globalThis.document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      if (bounds.top < rect.top || bounds.bottom > rect.bottom || !button.contains(hit))
        throw new Error('Account control is not reachable: ' + (button.getAttribute('aria-label') || button.textContent));
    }
    menu.focus();
    menu.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
    return null;
    } catch (error) { return error.message; }
  })()`);
  if (error) throw new Error(error);
  await waitForPage(
    webContents,
    'Account Escape focus return',
    `!globalThis.document.querySelector('[role="menu"]') && globalThis.document.activeElement?.getAttribute('aria-label') === 'Account'`,
  );
  await webContents.executeJavaScript(`(() => {
    globalThis.document.activeElement.click();
    return true;
  })()`);
  await waitForPage(
    webContents,
    'reopened Account popup',
    `globalThis.document.querySelector('[role="menu"] [aria-label="Zoom controls"]')`,
  );
  await settle(webContents);
}

module.exports = { SCENARIOS, prepareScenario, assertAccountMenu };
