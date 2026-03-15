This is the source code for hagush.org.il. The pages are deployed via github
pages from the docs directory.


The images are converted from PNG to WEBP with compression by
```
for f in *.png; do filename=${f%.*}; convert $f -quality 82 $filename.webp; done
```
