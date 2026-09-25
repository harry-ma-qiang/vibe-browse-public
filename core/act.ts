// Copyright (C) 2026 harry-ma-qiang
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Doing to a page what a person would do to it.
 *
 * Every event here is dispatched through the protocol rather than the document, so
 * the page receives it as trusted input. That is the whole reason to hold a debugger.
 */

import type { AgentCommand, AxNode, CdpAxNode, CommandResult } from './types';
import { redactNode } from './redact';

interface Box {
  x: number;
  y: number;
}

async function send(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

async function centre(tabId: number, backendNodeId: number): Promise<Box | null> {
  await send(tabId, 'DOM.scrollIntoViewIfNeeded', { backendNodeId });
  const held = (await send(tabId, 'DOM.getBoxModel', { backendNodeId })) as
    | { model?: { content: number[] } }
    | undefined;
  const points = held?.model?.content;
  if (!points || points.length < 8) return null;
  const at = (n: number): number => points[n] ?? 0;
  return {
    x: (at(0) + at(2) + at(4) + at(6)) / 4,
    y: (at(1) + at(3) + at(5) + at(7)) / 4,
  };
}

async function press(tabId: number, at: Box): Promise<void> {
  const shared = { x: at.x, y: at.y, button: 'left' as const, clickCount: 1 };
  await send(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...shared });
  await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...shared });
}

async function type(tabId: number, backendNodeId: number, text: string): Promise<void> {
  await send(tabId, 'DOM.focus', { backendNodeId });
  // why: insertText appends, so an unselected field becomes the old value plus the new.
  await send(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
  await send(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35, modifiers: 8 });
  await send(tabId, 'Input.insertText', { text });
}

async function stillIs(tabId: number, backendNodeId: number, was: AxNode): Promise<boolean> {
  const held = (await send(tabId, 'Accessibility.getPartialAXTree', {
    backendNodeId,
    fetchRelatives: false,
  })) as { nodes?: CdpAxNode[] } | undefined;
  const now = held?.nodes?.[0];
  if (!now) return false;
  if ((now.backendDOMNodeId ?? backendNodeId) !== was.backendDomNodeId) return false;
  if ((now.role?.value ?? 'unknown') !== was.role) return false;
  return was.value === '[password]' || redactNode(now).name === was.name;
}

const WHEEL = {
  up: { deltaX: 0, deltaY: -300 },
  down: { deltaX: 0, deltaY: 300 },
  left: { deltaX: -300, deltaY: 0 },
  right: { deltaX: 300, deltaY: 0 },
};

/** Carry out one command against one node of a tree already read. */
export async function act(
  tabId: number,
  command: AgentCommand,
  nodes: Map<number, AxNode>,
): Promise<CommandResult> {
  const node = nodes.get(command.nodeId);
  if (!node) return { ok: false, error: `no node ${command.nodeId} in this tree` };
  const backendNodeId = node.backendDomNodeId;
  if (backendNodeId === null) return { ok: false, error: `node ${command.nodeId} has no handle` };

  try {
    // why: an id names a place in a tree already read, and pages move.
    if (!(await stillIs(tabId, backendNodeId, node))) {
      return { ok: false, error: `node ${command.nodeId} is no longer the ${node.role} it named` };
    }
    if (command.action === 'focus') {
      await send(tabId, 'DOM.focus', { backendNodeId });
      return { ok: true };
    }
    if (command.action === 'setValue') {
      await type(tabId, backendNodeId, command.value);
      return { ok: true };
    }
    const at = await centre(tabId, backendNodeId);
    if (!at) return { ok: false, error: `node ${command.nodeId} is not on screen` };
    if (command.action === 'click') {
      await press(tabId, at);
      return { ok: true };
    }
    await send(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: at.x,
      y: at.y,
      ...WHEEL[command.direction],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
