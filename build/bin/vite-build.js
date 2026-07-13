#!/bin/bash
const { exec, cd, cp } = require('shelljs')
const { resolve } = require('path')
const p = resolve(__dirname, '../vite')
cd(p)

exec('npm run build')

// 2026-07-12 coder(lq): Electron previews run from work/app, so keep main-process code in sync with every frontend build.
cp(
  '-r',
  resolve(__dirname, '../../src/app/*'),
  resolve(__dirname, '../../work/app')
)
