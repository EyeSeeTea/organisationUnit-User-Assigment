import React from 'react';
import { Router, Route, IndexRoute, hashHistory, IndexRedirect } from 'react-router';
import log from 'loglevel';
import App from './App/App.component';
import List from './List/List.component';
import EditModelContainer from './EditModel/EditModelContainer.component';
import EditDataSetSections from './EditModel/EditDataSetSections.component';
import EditDataEntryForm from './EditModel/EditDataEntryForm.component';
import GroupEditor from './GroupEditor/GroupEditor.component';
import modelToEditStore from './EditModel/modelToEditStore';
import { getInstance } from 'd2/lib/d2';
import objectActions from './EditModel/objectActions';
import listActions from './List/list.actions';
import snackActions from './Snackbar/snack.actions';
import { initAppState, default as appState } from './App/appStateStore';
import OrganisationUnitList from './List/organisation-unit-list/OrganisationUnitList.component.js';
import OrganisationUnitHierarchy from './OrganisationUnitHierarchy';
import OrganisationUnitLevels from './OrganisationUnitLevels/OrganisationUnitLevels.component';
import EditOptionSet from './EditModel/EditOptionSet.component';

function initState({ params }) {
    initAppState({
        sideBar: {
            currentSection: params.groupName,
            currentSubSection: params.modelType,
        },
    });
}

function initStateOrgUnitList({ params }) {
    initAppState({
        sideBar: {
            currentSection: params.groupName,
            currentSubSection: 'organisationUnit',
        },
    }, true);
}

function initStateOrgUnitLevels({ params }) {
    initAppState({
        sideBar: {
            currentSection: params.groupName,
            currentSubSection: 'organisationUnitLevel',
        },
    });
}

function initStateOuHierarchy() {
    initAppState({
        sideBar: {
            currentSection: 'organisationUnitSection',
            currentSubSection: 'hierarchy',
        },
    });
}

// TODO: We could use an Observable that manages the current modelType to load the correct d2.Model. This would clean up the load function below.
function loadObject({ params }, replace, callback) {
    initState({ params });

    if (params.modelId === 'add') {
        getInstance().then((d2) => {
            const modelToEdit = d2.models[params.modelType].create();

            // Set the parent for the new organisationUnit to the selected OU
            // TODO: Should probably be able to do this in a different way when this becomes needed for multiple object types
            if (params.modelType === 'organisationUnit') {
                return appState
                // Just take the first value as we don't want this observer to keep updating the state
                    .take(1)
                    .subscribe((state) => {
                        if (state.selectedOrganisationUnit && state.selectedOrganisationUnit.id) {
                            modelToEdit.parent = {
                                id: state.selectedOrganisationUnit.id,
                            };
                        }

                        modelToEditStore.setState(modelToEdit);
                        callback();
                    });
            }

            modelToEditStore.setState(modelToEdit);
            return callback();
        });
    } else {
        objectActions.getObjectOfTypeById({ objectType: params.modelType, objectId: params.modelId })
            .subscribe(
                () => callback(),
                (errorMessage) => {
                    replace(`/list/${params.modelType}`);
                    snackActions.show({ message: errorMessage });
                    callback();
                }
            );
    }
}

function loadOrgUnitObject({ params }, replace, callback) {
    loadObject({
        params: {
            modelType: 'organisationUnit',
            groupName: params.groupName,
            modelId: params.modelId
        }
    }, replace, callback);
}

function loadOptionSetObject({ params }, replace, callback) {
    loadObject({
        params: {
            modelType: 'optionSet',
            groupName: params.groupName,
            modelId: params.modelId
        }
    }, replace, callback);
}

function loadList({ params }, replace, callback) {
    if (params.modelType === 'organisationUnit') {
        // Don't load organisation units as they get loaded through the appState
        // Also load the initialState without cache so we refresh the assigned organisation units
        // These could have changed by adding an organisation unit which would need to be reflected in the
        // organisation unit tree
        initState({ params }, true);
        return callback();
    }

    initState({ params });
    return listActions.loadList(params.modelType)
        .subscribe(
            (message) => {
                log.debug(message);
                callback();
            },
            (message) => {
                if (/^.+s$/.test(params.modelType)) {
                    const nonPluralAttempt = params.modelType.substring(0, params.modelType.length - 1);
                    log.warn(`Could not find requested model type '${params.modelType}' attempting to redirect to '${nonPluralAttempt}'`);
                    replace(`list/${nonPluralAttempt}`);
                    callback();
                } else {
                    log.error('No clue where', params.modelType, 'comes from... Redirecting to app root');
                    log.error(message);

                    replace('/');
                    callback();
                }
            }
        );
}

function cloneObject({ params }, replace, callback) {
    initState({ params });

    objectActions.getObjectOfTypeByIdAndClone({ objectType: params.modelType, objectId: params.modelId })
        .subscribe(
            () => callback(),
            (errorMessage) => {
                replace(`/list/${params.modelType}`);
                snackActions.show({ message: errorMessage });
                callback();
            }
        );
}

const routes = (
    <Router history={hashHistory}>
        <Route path="/" component={App} >
            <IndexRedirect to="list/userSection/user" />        
            <Route path="list/:groupName">
                <Route
                    path="organisationUnit"
                    component={OrganisationUnitList}
                    onEnter={initStateOrgUnitList}
                />
                <Route
                    path="organisationUnitLevel"
                    component={OrganisationUnitLevels}
                    onEnter={initStateOrgUnitLevels}
                />
                <Route
                    path=":modelType"
                    component={List}
                    onEnter={loadList}
                    disableSidebar
                />
            </Route>
            <Route path="edit/:groupName">
                <Route
                    path="organisationUnit/:modelId"
                    component={EditModelContainer}
                    onEnter={loadOrgUnitObject}
                />
                <Route
                    path="optionSet/:modelId"
                    component={EditOptionSet}
                    onEnter={loadOptionSetObject}
                >
                    <IndexRoute />
                    <Route path=":activeView" />
                </Route>
                <Route
                    path=":modelType/:modelId/sections"
                    component={EditDataSetSections}
                    onEnter={loadObject}
                />
                <Route
                    path=":modelType/:modelId/dataEntryForm"
                    component={EditDataEntryForm}
                    onEnter={loadObject}
                    disableSidebar
                />
                <Route
                    path=":modelType/:modelId"
                    component={EditModelContainer}
                    onEnter={loadObject}
                />
            </Route>
            <Route
                path="clone/:groupName/:modelType/:modelId"
                component={EditModelContainer}
                onEnter={cloneObject}
            />
            <Route
                path="group-editor"
                component={GroupEditor}
                onEnter={initState}
            />
            <Route
                path="organisationUnitSection/hierarchy"
                component={OrganisationUnitHierarchy}
                onEnter={initStateOuHierarchy}
            />
        </Route>
    </Router>
);

export function goToRoute(url) {
    hashHistory.push(url);
}

export function goBack() {
    hashHistory.goBack();
}

export default routes;
