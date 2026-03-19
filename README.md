This is the source code for hagush.org.il. The pages are deployed via github
pages from the docs directory.


The images are converted from PNG to WEBP with compression by
```
for f in *.png; do filename=${f%.*}; convert $f -quality 82 $filename.webp; done
```

To import new candidates from the google form, use the `parse_candidates.py`
script. It uses the current candidates.json, and a downloaded csv file from the
google responses. If you want to add new candidates, there is a missing field:
the english ID. This will be used to relate the pictures in portraits to the hebrew
name. You can either input the ascii name or (better) use a mapping.txt file
like
```
Dany_e    דני אלגרט
Galeb_s   גאלב סלאמנה
Hadas_r   הדס רגולסקי
Lee_h     לי הופמן אגיב
Somaya_b  סומיה בשיר
inbar_b   ענבר בזק
```
