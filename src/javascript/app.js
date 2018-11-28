Ext.define("allowed_values_audit", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    items: [{
        xtype: 'container',
        id: 'labelArea',
        html: '' // Set from launch
    }, {
        id: 'grid-area',
        xtype: 'container',
        flex: 1,
        type: 'vbox',
        align: 'stretch'
    }],
    config: {
        defaultSettings: {
            piType: undefined,
            auditFieldName: undefined
        }
    },

    integrationHeaders: {
        name: "allowed_values_audit"
    },

    launch: function() {
        this.selectedPiType = this.getSetting('piType');
        this.auditFieldName = this.getSetting('auditFieldName');

        if (!this.auditFieldName) {
            var labelArea = this.down('#labelArea');
            labelArea.update('<span class="ts-page-label">No settings applied.  Select "Edit App Settings." from the gear menu.</span>');
            return;
        }

        var piTypeDeferred = Ext.create('Deft.Deferred');

        if (!this.selectedPiType) {
            // Lowest PI type not set, load a default.
            Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
                scope: this,
                success: function(records) {
                    this.selectedPiType = records[0].get('TypePath');
                    this.updateSettingsValues({
                        settings: {
                            piType: this.selectedPiType
                        }
                    });
                    piTypeDeferred.resolve();
                }
            })
        }
        else {
            piTypeDeferred.resolve();
        }

        //this.setTypeAndFieldLabel();

        piTypeDeferred.promise.then({
            scope: this,
            success: this.getAllowedValueFilters
        }).then({
            scope: this,
            success: function(allowedValueFilter) {
                this.allowedValueFilter = allowedValueFilter;
                return this._buildStore();
            }
        })
    },

    setTypeAndFieldLabel: function() {
        var labelArea = this.down('#labelArea');
        labelArea.update('<span class="ts-page-label">' + this.selectedPiType + ' with an invalid ' + this.auditFieldName + ' value.</span>');
    },

    getAllowedValueFilters: function() {
        return Rally.data.ModelFactory.getModel({
            type: this.selectedPiType
        }).then({
            scope: this,
            success: function(model) {
                var auditField = model.getField(this.auditFieldName);
                var allowedValueStore = auditField.getAllowedValueStore();
                return allowedValueStore.load();
            }
        }).then({
            scope: this,
            success: function(allowedValues) {
                var queries = _.map(allowedValues, function(v) {
                    console.log(v.get('StringValue'))
                    return {
                        property: this.auditFieldName,
                        operator: '!=',
                        value: v.get('StringValue')
                    }
                }, this);
                return Rally.data.wsapi.Filter.and(queries);
            }
        })
    },

    // Usual monkey business to size gridboards
    onResize: function() {
        this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },

    _buildStore: function() {

        this.modelNames = [this.selectedPiType];
        var fetch = ['FormattedID', 'Name'];
        var dataContext = this.getContext().getDataContext();

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: this.modelNames,
            enableHierarchy: true,
            remoteSort: true,
            fetch: fetch,
            context: dataContext,
            enablePostGet: true,
            enableRootLevelPostGet: true
        }).then({
            success: this._addGridboard,
            scope: this
        });
    },
    _addGridboard: function(store) {
        var gridArea = this.down('#grid-area')
        gridArea.removeAll();

        var currentModelName = this.modelNames[0];

        var context = this.getContext();
        var dataContext = context.getDataContext();

        this.gridboard = gridArea.add({
            xtype: 'rallygridboard',
            context: context,
            modelNames: this.modelNames,
            toggleState: 'grid',
            height: gridArea.getHeight(),
            listeners: {
                scope: this,
                viewchange: this.viewChange,
            },
            plugins: [{
                    ptype: 'rallygridboardinlinefiltercontrol',
                    inlineFilterButtonConfig: {
                        stateful: true,
                        stateId: this.getModelScopedStateId(currentModelName, 'filters'),
                        modelNames: this.modelNames,
                        inlineFilterPanelConfig: {
                            quickFilterPanelConfig: {
                                whiteListFields: [
                                    'Tags',
                                    'Milestones'
                                ]
                            }
                        }
                    }
                },
                {
                    ptype: 'rallygridboardfieldpicker',
                    headerPosition: 'left',
                    modelNames: this.modelNames,
                    stateful: true,
                    stateId: this.getModelScopedStateId(currentModelName, 'fields'),
                },
                {
                    ptype: 'rallygridboardsharedviewcontrol',
                    sharedViewConfig: {
                        stateful: true,
                        stateId: this.getModelScopedStateId(currentModelName, 'views'),
                        stateEvents: ['select', 'beforedestroy']
                    },
                }
            ],
            gridConfig: {
                store: store,
                storeConfig: {
                    context: dataContext,
                    filters: this.allowedValueFilter,
                }
            }
        });
    },

    viewChange: function() {
        this._buildStore();
    },

    getModelScopedStateId: function(modelName, id) {
        return this.getContext().getScopedStateId(modelName + '-' + id);
    },

    getHeight: function() {
        var el = this.getEl();
        if (el) {
            var height = this.callParent(arguments);
            return Ext.isIE8 ? Math.max(height, 600) : height;
        }

        return 0;
    },

    setHeight: function(height) {
        this.callParent(arguments);
        if (this.gridboard) {
            this.gridboard.setHeight(height);
        }
    },

    getSettingsFields: function() {
        var piTypePathSetting = this.getSetting('piType');
        return [{
            xtype: 'rallyportfolioitemtypecombobox',
            name: 'piType',
            value: piTypePathSetting,
            fieldLabel: 'Artifact Type',
            valueField: 'TypePath',
            labelWidth: 150,
            listeners: {
                scope: this,
                change: function(cmp, newValue, oldValue) {
                    var fieldPicker = Ext.ComponentManager.get('fieldPickerSettingsControl');
                    fieldPicker.refreshWithNewModelType(newValue);
                }
            }
        }, {
            xtype: 'rallyfieldcombobox',
            id: 'fieldPickerSettingsControl',
            name: 'auditFieldName',
            model: piTypePathSetting,
            fieldLabel: 'Field to Audit',
            labelWidth: 150,
            allowNoEntry: true
        }];
    },

    onSettingsUpdate: function() {

    }
});
