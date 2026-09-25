// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Mounting the panel, and nothing else. */

import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const held = document.getElementById('root');
if (held) createRoot(held).render(<App />);
