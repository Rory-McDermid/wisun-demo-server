const http = require('http');
const fs = require('fs');
const url = require('url');

var config = require('./config.json');

const readingTypes = ['noiseReading', 'motionReading'];

const {InfluxDB, Point} = require('@influxdata/influxdb-client')
const client = new InfluxDB({url: config.influxDB.url, token: config.influxDB.token})

queryApi = client.getQueryApi(config.influxDB.org);

function sendFile(fileLoc, res){
	const stream = fs.createReadStream(fileLoc);
	stream.on('error', (err) => {
		res.writeHead(404, 'Not Found');
		res.end('404');
	});
	res.setHeader('Content-Type', 'text/html');
	stream.pipe(res);
}

function send400err(str, res){
	res.setHeader('Content-Type', 'text/plain');
	res.writeHead(400, 'error');
	res.end(str);
}

function makeObserver(res, obj){
	const observer = {
		next(row, tableMeta) {
			const o = tableMeta.toObject(row)
			obj[o._measurement].push({sensor: o.sensor, time: o._time, value: o._value});
		},
		complete(){
			res.setHeader('Content-Type', 'aplication/json');
			res.end(JSON.stringify(obj));
		},
		error(err){
			console.log(err);
			send400err("influxDB query error", res);
		}
	};
	return observer;
}

function apiReq(path, res){
	u = new URL(path, `http://${config.server.hostname}`);
	//console.log(u);
	if(u.pathname == '/api/recent')apiRecent(res);
	else if(u.pathname == '/api/since')apiSince(u, res);
	else{
		send400err(`Unrecognised endpoint: ${u}`, res);
	}
}

function apiRecent(res){
	let obj = {//test object
		noiseReading : [
		],
		motionReading : [
		]};
	const q =
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: 0)
		|> last()`;
	const observer = makeObserver(res, obj);
	queryApi.queryRows(q, observer);
}

function apiSince(u, res){
	/********************************************
	NOTE: the way this query is being constructed
	is NOT SECURE. The inputs are not verified &
	are vunrable to a code injection attack.
	********************************************/
	let q = 
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: ${u.searchParams.get('t')})`;
	if(u.searchParams.has('s'))q += `|> filter(fn: (r) => r.sensor == "${u.searchParams.get('s')}")`;
	//console.log(q)
	let obj = {//test object
		noiseReading : [
		],
		motionReading : [
		]};
	const observer = makeObserver(res, obj);
	queryApi.queryRows(q, observer);
}

const server = http.createServer((req, res) => {
	res.statusCode = 200;
	if(req.url == '/')sendFile('index.html', res);
	else if(req.url.startsWith('/api/'))apiReq(req.url, res);
	else{
		sendFile('static' + req.url, res);
	}
});

server.listen(config.server.port, config.server.hostname, () => {
	console.log(`Server running at http://${config.server.hostname}:${config.server.port}/`);
});
