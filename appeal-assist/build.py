"""Inline CSS and JS into one file for publishing as a claude.ai artifact.
Usage: python3 build.py OUTPUT.html"""
import re, sys
s = open('index.html').read()
title = re.search(r'<title>.*?</title>', s).group(0)
body = re.search(r'<body>(.*)</body>', s, re.S).group(1)
css = open('styles.css').read()
for src in re.findall(r'<script src="(js/[^"]+)"></script>', body):
    body = body.replace(f'<script src="{src}"></script>', '<script>\n' + open(src).read() + '\n</script>')
open(sys.argv[1], 'w').write(title + '\n<style>\n' + css + '\n</style>\n' + body)
