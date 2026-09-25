// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'vibe-browse',
    description: "Chrome's accessibility tree as a tool-call interface for AI agents",
    permissions: ['sidePanel', 'debugger', 'tabs', 'tabGroups', 'alarms', 'storage'],
    action: { default_title: 'vibe-browse' },
    side_panel: { default_path: 'sidepanel.html' },
  },
});
