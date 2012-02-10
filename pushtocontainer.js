#!/usr/bin/env node

var fs = require('fs'),
	crypto = require('crypto'),
	azure = require('azure'),
	_ = require('underscore'),
	program = require('commander');

function Semaphore(fireFunc, initLock) {
	this.lock = initLock || 0;
	this.func = fireFunc;
}
Semaphore.prototype = {
	up: function() { this.lock ++ },
	down: function() { if (--this.lock == 0 && this.func) this.func(); }
};

function Throttled(max, semaphore) {
	this.max = max;
	this.semaphore = semaphore || new Semaphore();
	this.queue = [];
}
Throttled.prototype = {
	enqueue: function(fn) { this.queue.push(fn); },
	callback: function() { this.semaphore.down(); this.run(); },
	run: function() {
		while (this.semaphore.lock < this.max && this.queue.length > 0) {
			this.semaphore.up();
			var that = this;
			this.queue.shift()(function() { that.callback.call(that) });
		}
	}
};

function enumerateFiles(path, cb) {
	var localFiles = {};
	var sem = new Semaphore(function() { cb (null, localFiles); });
	fs.readdir(path, function (err, files) {
		if (files.length == 0) {
			sem.up();
			sem.down();
		}
		files.forEach(function (file) {
			sem.up();
			var fullPath = path + '/' + file;
			fs.stat(fullPath, function (err, stats) {
				if (err) throw err;
				if (stats.isDirectory()) {
					enumerateFiles(fullPath, function (err, files) {
						_.extend(localFiles, files);
						sem.down();
					});
				} else {
					var digest = crypto.createHash('md5');
					fs.createReadStream(fullPath)
						.on('data', function (chunk) {
							digest.update(chunk);
						})
						.on('end', function () {
							localFiles[fullPath] = digest.digest('base64');
							sem.down();
						});
				}
			});
		});
	});
}

program
	.version('1.0')
	.option('-p, --path [path]', 'local path (defaults to the current directory)', '.')
	.option('-a, --account <account-name>', 'blob storage account name')
	.option('-k, --key <account-key>', 'blob storage account key')
	.option('-c, --container <container-name>', 'blob storage container name')
	.option('-m, --max-connections [maximum]', 'maximum number of concurrent connections', parseInt, 32)
	.parse(process.argv);

_.each(['account', 'key', 'container'], function (optionName) {
	if (program[optionName] == null) {
		program.missingArgument(optionName);
	}
});

enumerateFiles(program.path, function (err, files) {
	var blobClient = new azure.createBlobService(program.account, program.key);
	blobClient.createContainerIfNotExists(program.container, function (error) {
		blobClient.listBlobs(program.container, function (err, blobs) {
			var throttled = new Throttled(program.maxConnections);
			var exists = {};
			blobs.forEach(function (blob) {
				if (!files[program.path + '/' + blob.name]) {
					throttled.enqueue(function (next) {
						console.log('deleting ' + blob.name);
						blobClient.deleteBlob(program.container, blob.name, next);
					});
				} else if (files[program.path + '/' + blob.name] != blob.properties['Content-MD5']) {
					throttled.enqueue(function (next) {
						console.log('updating ' + blob.name);
						var path = program.path + '/' + blob.name;
						blobClient.createBlockBlobFromFile(program.container, blob.name, path, { contentMD5: files[program.path + '/' + blob.name] }, next);
					});
				}
				exists[blob.name] = true;
			});
			_.each(files, function (value, key) {
				if (!exists[key.substring(program.path.length+1)]) {
					throttled.enqueue(function (next) {
						console.log('uploading ' + key);
						blobClient.createBlockBlobFromFile(program.container, key.substring(program.path.length + 1), key, { contentMD5: value }, next);
					});
				}
			});
			throttled.run();
		});
	});
});