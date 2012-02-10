`pushtocontainer.js` mirrors files to a Windows Azure blob storage container.
It only uploads changed files, and it deletes blobs that correspond to deleted
files. After it's run, the blob container should be a mirror of the local
directory.

It's especially handy for things like
[noderole](https://github.com/smarx/noderole), which can be configured to
pull source files from a blob container. Using `pushtocontainer.js`, source
changes can be efficiently copied to blob storage to update a running app.

Installation
------------
`npm install pushtocontainer -g`

Usage
-----
  Usage: pushtocontainer [options]

  Options:

    -h, --help                        output usage information
    -V, --version                     output the version number
    -p, --path [path]                 local path (defaults to the current directory)
    -a, --account <account-name>      blob storage account name
    -k, --key <account-key>           blob storage account key
    -c, --container <container-name>  blob storage container name
    -m, --max-connections [maximum]   maximum number of concurrent connections

Notes / Known Issues
--------------------
This tool doesn't (yet) support files larger than 64MB in size. Let me know if
you need that functionality, or better yet, submit a pull request!

`pushtocontainer.js` relies on MD5 hashes to determine which files should be
transferred. If you copy files into blob storage via some other tool, you may
find that the MD5 hash hasn't been set, and `pushtocontainer.js` transfers all
the files again (thinking they may need to be updated).

Some proxies (particularly corporate environments) block many rapid HTTP
requests in succession. If this happens to you, you can simply wait and run the
tool again. It won't transfer files that are already up-to-date. You may want
to use the `--max-connections` option to limit the concurrency. This will
effectively slow down the uploads and possibly avoid proxy limits.