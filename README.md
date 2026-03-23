# hagush.org.il
This is the source code for hagush.org.il.

The pages are deployed via GitHub Pages from the docs directory.

## Image conversion:
The images are converted from PNG to WEBP with compression by running:
```
for f in *.png; do filename=${f%.*}; convert $f -quality 82 $filename.webp; done
```
It loops over all .png files in the current folder and uses ImageMagick’s `convert` command to generate a .webp version of each one.

To install ImageMagick:
```
brew install imagemagick
```


## Importing Candidates from Google-Forms:
To import new candidates from the google form, use the `parse_candidates.py` python script.

First, download the latest responses.csv file to the repo root folder.<br>
Then, Run the script from there:
```
python3 parse_candidates.py --json docs/candidates.json --csv responses.csv --portraits docs/portraits
```

It uses the current `candidates.json`, and a downloaded responses.csv file from the
google responses.

If you want to add new candidates, you **MUST** update the `English-ID` when prompted to.<br>
It is used to relate the pictures in portraits to the Hebrew names.

You can also use a mapping.txt file (for bulk imports) like so:
```
Dany_e    דני אלגרט
Galeb_s   גאלב סלאמנה
Hadas_r   הדס רגולסקי
Lee_h     לי הופמן אגיב
Somaya_b  סומיה בשיר
inbar_b   ענבר בזק
```
