'use strict';

const colors  = require('colors');
const fs      = require('fs');
const fsExtra = require('fs-extra');
const _       = require('lodash');
const request = require('request');
const Promise = require('bluebird');

const pkg = require('../../../..//package.json');

/**
 * Class representing project creation .
 */
class CreateCMD {
  constructor(sqz) {
    this.sqz             = sqz;
    const options        = this.sqz.cli.params.get().options;
    this.projectName     = options.project;
    this.projectEmail    = options.email;
    this.projectTemplate = options.template;
    this.noChecksums = options.noChecksums;
    this.projectType     = options.type;
    this.projectPath     = `${process.cwd()}/${this.projectName}`;
    this.template        = options.template;
    this.templateDir     = `${__dirname}/../../templates/lib/samples/${this.template}`;
  }

  run() {
    return new Promise((resolve) => {
      this.sqz.cli.log.info(`Creating project ${colors.blue.bold(this.projectName)}`);
      this.validate();
      this.copyFiles();
      this.postCreate().then(() => {
        this.sqz.cli.log.info('Project successfully created !\n');
        this.sqz.cli.log.console(
          `Switch to the project's directory : ${colors.blue.bold(`cd ${this.projectName}`)}\n` +
          `Install project's requirements    : ${colors.blue.bold('sqz install')}\n` +
          `Compile project                   : ${colors.blue.bold('sqz compile')}\n`
        );
        resolve();
      });
    });
  }

  validate() {
    this.sqz.cli.log.debug(`Validating project name ${colors.white(this.projectName)}`);
    if (!this.projectName.match(/^[0-9a-z-]+$/i)) {
      this.sqz.cli.log.error('Project name should contain only letters , numbers or "-" sign');
    }
    this.sqz.cli.log.debug(`Checking if template ${colors.white(this.template)} is supported`);
    if (!fs.existsSync(this.templateDir)) {
      this.sqz.cli.log.error(`Template ${colors.blue.bold(this.template)} it's not currently supported by Squeezer framework`);
    }
    this.sqz.cli.log.debug(`Checking if project ${colors.blue.bold(this.projectName)} exists`);
    if (fs.existsSync(this.projectPath)) {
      this.sqz.cli.log.error(`A project with name ${colors.blue.bold(this.projectName)} already exists`);
    }
  }

  copyFiles() {
    const sharedData = this.sqz.yaml.parse(`${this.templateDir}/shared.yml`);
    this.sqz.cli.log.debug('Copying base files');
    fsExtra.copySync(`${this.templateDir}/data`, this.projectPath);
    this.sqz.cli.log.debug('Copying shared files');
    _.forEach(sharedData, (line) => {
      const xplShared = line.split(':');
      const source    = xplShared[0];
      const target    = xplShared[1];
      fsExtra.copySync(`${this.templateDir}/../../${source}`, `${this.projectPath}/${target}`);
    });
  }

  postCreate() {
    return new Promise((resolve) => {
      this.sqz.cli.log.debug('Post project creation actions');
      this.sqz.cli.log.debug('Compiling project config');
      const compiledProjectConfig = _.template(
        fs.readFileSync(`${this.projectPath}/squeezer.yml`, 'utf8')
      );

      this.getKey().then((key) => {
        fs.writeFileSync(
          `${this.projectPath}/squeezer.yml`,
          compiledProjectConfig({
            name    : this.projectName,
            key     : key,
            version : pkg.version
          }).replace(/\\\\/g, '')
        );
        resolve();
      });
    });
  }

  getKey() {
    return new Promise((resolve, reject) => {
      const apiBaseUrl          = this.sqz.vars.apiBaseUrl;
      const postProjectEndpoint = `${apiBaseUrl}/rest/v1/projects`;
      const squeezerConfig      = this.sqz.yaml.parse(`${this.projectPath}/squeezer.yml`);

      this.sqz.cli.log.debug(
        `Getting the Squeezer deployment key for project ${this.projectName}`
      );

      if (this.noChecksums) {
        resolve('null');
      } else {
        request.post(
          postProjectEndpoint,
          {
            json : {
              name     : this.projectName,
              email    : this.projectEmail,
              type     : squeezerConfig.type,
              template : this.projectTemplate
            }
          },
          (error, res, body) => {
            if (!error && res.statusCode === 200 && body.message === 'success') {
              resolve(body.data.key);
            } else if (body && body.message) {
              reject(body.message);
            } else if (error) {
              reject(error);
            } else {
              reject('Cannot retrieve a deployment key');
            }
          }
        );
      }
    });
  }
}

module.exports = CreateCMD;
